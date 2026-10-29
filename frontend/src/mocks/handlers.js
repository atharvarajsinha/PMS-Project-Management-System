// MSW v2 request handlers mocking the PMS Phase 1 REST API (see docs/API.md).
import { http, HttpResponse, delay } from 'msw';
import { getDb, saveDb, uid, toId, nowIso, readSession, writeSession } from './db.js';

// Opaque tokens (CSRF, password reset) — unrelated to record ids
const randomToken = () => crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

const BASE = '/api/v1';
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ADMINS = ['SUPER_ADMIN', 'ADMIN'];
const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_S = 600;

// ===========================================================================
// Errors & responses
// ===========================================================================

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const apiError = (status, code, message, details) => new ApiError(status, code, message, details);
const validationError = (details, message = 'Some fields are invalid.') =>
  apiError(400, 'VALIDATION_ERROR', message, details);
const notFound = (message = 'Not found.') => apiError(404, 'NOT_FOUND', message);
const conflict = (message, details) => apiError(409, 'CONFLICT', message, details);
const hasDependents = (message) => apiError(409, 'HAS_DEPENDENTS', message);
const permissionDenied = () =>
  apiError(403, 'PERMISSION_DENIED', 'You do not have permission to perform this action.');

function errorResponse(e) {
  const body = { error: { code: e.code, message: e.message } };
  if (e.details) body.error.details = e.details;
  return HttpResponse.json(body, { status: e.status });
}

const json = (data, status = 200) => HttpResponse.json(data, { status });
const empty = (status = 204) => new HttpResponse(null, { status });

// ===========================================================================
// Validation helpers
// ===========================================================================

function makeValidator() {
  const errors = {};
  return {
    errors,
    add(field, msg) {
      (errors[field] ||= []).push(msg);
    },
    has(field) {
      return Boolean(errors[field]);
    },
    throwIfAny() {
      if (Object.keys(errors).length) throw validationError(errors);
    },
  };
}

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const present = (body, field) => Object.prototype.hasOwnProperty.call(body, field);

/**
 * Clean a string field. Returns undefined when absent (and not required),
 * null when explicitly blank on an optional field, else the trimmed string.
 * `partial` = PATCH semantics: absent fields are skipped, present ones validated.
 */
function cleanString(v, body, field, { required = false, partial = false, min = 1, max = 255 } = {}) {
  if (partial && !present(body, field)) return undefined;
  const raw = body[field];
  if (isBlank(raw)) {
    if (required) {
      v.add(field, raw === undefined && !partial ? 'This field is required.' : 'This field may not be blank.');
      return undefined;
    }
    return raw === undefined ? undefined : null;
  }
  if (typeof raw !== 'string') {
    v.add(field, 'Not a valid string.');
    return undefined;
  }
  const s = raw.trim();
  if (s.length < min) v.add(field, `Ensure this field has at least ${min} characters.`);
  if (s.length > max) v.add(field, `Ensure this field has no more than ${max} characters.`);
  return s;
}

function cleanEmail(v, body, field = 'email', { required = true } = {}) {
  const s = cleanString(v, body, field, { required, max: 254 });
  if (s === undefined || s === null) return s;
  const email = s.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    v.add(field, 'Enter a valid email address.');
    return undefined;
  }
  return email;
}

function cleanPhone(v, body, field = 'phone', { partial = false } = {}) {
  if (!present(body, field)) return undefined;
  const raw = body[field];
  if (isBlank(raw)) return null;
  if (typeof raw !== 'string') {
    v.add(field, 'Enter a valid phone number.');
    return undefined;
  }
  const p = raw.replace(/[\s-]/g, '');
  if (!/^\+?\d+$/.test(p) || p.length < 7 || p.length > 20) {
    v.add(field, 'Enter a valid phone number.');
    return undefined;
  }
  return p;
}

function cleanInt(v, body, field, { required = false, partial = false, min, max } = {}) {
  if ((partial || !required) && !present(body, field)) return undefined;
  const raw = body[field];
  if (raw === undefined || raw === null || raw === '') {
    v.add(field, 'This field is required.');
    return undefined;
  }
  const n = typeof raw === 'string' && /^-?\d+$/.test(raw.trim()) ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isInteger(n)) {
    v.add(field, 'A valid integer is required.');
    return undefined;
  }
  if (min !== undefined && n < min) v.add(field, `Ensure this value is greater than or equal to ${min}.`);
  if (max !== undefined && n > max) v.add(field, `Ensure this value is less than or equal to ${max}.`);
  return n;
}

function cleanBool(v, body, field) {
  if (!present(body, field)) return undefined;
  const raw = body[field];
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  v.add(field, 'Must be a valid boolean.');
  return undefined;
}

/** Id field: returns undefined (absent), null (explicit null when allowed) or the integer id. */
function cleanId(v, body, field, { required = true, nullable = false } = {}) {
  if (!present(body, field) || body[field] === undefined) {
    if (required) v.add(field, 'This field is required.');
    return undefined;
  }
  const raw = body[field];
  if (raw === null || raw === '') {
    if (nullable) return null;
    v.add(field, 'This field may not be null.');
    return undefined;
  }
  // Like DRF's PrimaryKeyRelatedField: 7 and "7" are both accepted
  const id = toId(raw);
  if (Number.isNaN(id)) {
    v.add(field, `Incorrect type. Expected pk value, received ${typeof raw}.`);
    return undefined;
  }
  return id;
}

function rejectReadOnly(v, body, fields, message = 'This field is read-only.') {
  fields.forEach((f) => {
    if (present(body, f)) v.add(f, message);
  });
}

const COMMON_PASSWORDS = new Set([
  'password1', 'password123', 'passw0rd', 'qwerty123', '12345678a', 'abc12345', 'admin123', 'welcome1', 'letmein1', 'iloveyou1',
]);

/** Returns an array of policy violation messages (empty = ok). */
function passwordProblems(pw, user) {
  const problems = [];
  if (typeof pw !== 'string' || pw.length === 0) return ['This field is required.'];
  if (pw.length < 8) problems.push('This password is too short. It must contain at least 8 characters.');
  if (!/[A-Za-z]/.test(pw)) problems.push('This password must contain at least one letter.');
  if (!/\d/.test(pw)) problems.push('This password must contain at least one number.');
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) problems.push('This password is too common.');
  if (user) {
    const local = (user.email || '').split('@')[0].toLowerCase();
    const lowered = pw.toLowerCase();
    if (local.length >= 4 && lowered.includes(local)) problems.push('The password is too similar to the email.');
    const nameParts = (user.name || '').toLowerCase().split(/\s+/).filter((p) => p.length >= 4);
    if (nameParts.some((p) => lowered.includes(p))) problems.push('The password is too similar to the name.');
  }
  return problems;
}

// ===========================================================================
// Request helpers
// ===========================================================================

function readCookie(request, name) {
  let source = '';
  try {
    if (typeof document !== 'undefined' && typeof document.cookie === 'string') source = document.cookie;
  } catch {
    source = '';
  }
  if (!source) source = request.headers.get('cookie') || '';
  const match = source.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function checkCsrf(request) {
  const header = request.headers.get('x-csrftoken');
  const cookie = readCookie(request, 'csrftoken');
  if (!header || !cookie || header !== cookie) {
    throw apiError(403, 'CSRF_FAILED', 'CSRF verification failed. Request aborted.');
  }
}

async function readBody(request) {
  let text = '';
  try {
    text = await request.text();
  } catch {
    text = '';
  }
  if (!text || !text.trim()) return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw validationError({ non_field_errors: ['Malformed JSON.'] }, 'Malformed JSON request body.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw validationError({ non_field_errors: ['Expected a JSON object.'] }, 'Invalid request body.');
  }
  return parsed;
}

const randomLatency = () => 150 + Math.floor(Math.random() * 250);

// ===========================================================================
// Lookups
// ===========================================================================

// Every lookup normalises the incoming id (URL param, header or body), so "7" finds record 7
const byId = (list, id) => {
  const key = toId(id);
  return (key ? list.find((x) => x.id === key) : undefined) || null;
};
const userById = (id) => byId(getDb().users, id);
const collegeById = (id) => byId(getDb().colleges, id);
const findUserByEmail = (email) => getDb().users.find((u) => u.email === email) || null;
const inCollege = (list, collegeId) => list.filter((x) => x.college_id === collegeId);
const getInCollege = (list, id, collegeId) => {
  const item = byId(list, id);
  return item && item.college_id === collegeId ? item : null;
};
const collegeAdminUser = (collegeId) =>
  getDb().users.find((u) => u.role === 'ADMIN' && u.college_id === collegeId) || null;
const settingsFor = (collegeId) => getDb().settings.find((s) => s.college_id === collegeId) || null;
const facultyUser = (f) => userById(f.user_id);
const studentUser = (s) => userById(s.user_id);
const sectionSemester = (section) => byId(getDb().semesters, section.semester_id);
const studentsInSection = (sectionId) => getDb().students.filter((s) => s.section_id === sectionId);
const sectionsInSemester = (semesterId) => getDb().sections.filter((s) => s.semester_id === semesterId);

// ===========================================================================
// Session / auth / college context
// ===========================================================================

function sessionUser() {
  const id = readSession();
  if (!id) return null;
  const user = userById(id);
  if (!user || user.status !== 'ACTIVE') {
    writeSession(null);
    return null;
  }
  if (user.college_id) {
    const college = collegeById(user.college_id);
    if (!college || college.status !== 'ACTIVE') {
      writeSession(null);
      return null;
    }
  }
  return user;
}

/** "Revoke sessions" for a user: only one mock session exists, clear it if it belongs to them. */
function revokeSessionsFor(userId) {
  if (readSession() === userId) writeSession(null);
}

function resolveCollege(request, user) {
  if (user.role === 'SUPER_ADMIN') {
    const header = request.headers.get('x-college-id');
    if (!header) {
      throw apiError(400, 'COLLEGE_CONTEXT_REQUIRED', 'Send the X-College-Id header to work inside a college.');
    }
    const college = collegeById(header.trim());
    if (!college) throw notFound('College not found.');
    return college;
  }
  const college = collegeById(user.college_id);
  if (!college) throw notFound('College not found.');
  return college;
}

// ===========================================================================
// Route wrapper
// ===========================================================================

/**
 * options:
 *   auth: false              → public endpoint
 *   roles: [...]             → allowed roles (default: any logged-in user)
 *   college: true            → resolve college context into ctx.college
 *   allowPasswordChange: true→ allowed while must_change_password is true
 */
// Query-string filters like ?semester_id=7 compare against integer fields: hand them out as integers.
// Handlers only call .get(); a malformed id becomes NaN, which matches nothing.
function idAwareQuery(searchParams) {
  return {
    get(key) {
      const value = searchParams.get(key);
      return key.endsWith('_id') && value !== null ? toId(value) : value;
    },
  };
}

function route(method, path, options, resolver) {
  return http[method](BASE + path, async ({ request, params }) => {
    await delay(randomLatency());
    const unsafe = UNSAFE_METHODS.has(request.method);
    try {
      const url = new URL(request.url);
      const ctx = { request, params, url, query: idAwareQuery(url.searchParams), db: getDb(), body: {} };
      if (unsafe) checkCsrf(request);
      if (options.auth !== false) {
        const user = sessionUser();
        if (!user) throw apiError(401, 'NOT_AUTHENTICATED', 'Authentication credentials were not provided.');
        ctx.user = user;
        if (user.must_change_password && !options.allowPasswordChange) {
          throw apiError(403, 'PASSWORD_CHANGE_REQUIRED', 'You must change your temporary password first.');
        }
        if (options.roles && !options.roles.includes(user.role)) throw permissionDenied();
        if (options.college) ctx.college = resolveCollege(request, user);
      }
      if (unsafe) ctx.body = await readBody(request);
      return await resolver(ctx);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e);
      console.error('[mock] Unhandled error', e);
      return errorResponse(apiError(500, 'SERVER_ERROR', 'Unexpected server error.'));
    } finally {
      if (unsafe) saveDb();
    }
  });
}

const PUBLIC = { auth: false };
const SUPER_ONLY = { roles: ['SUPER_ADMIN'] };
const COLLEGE_ANY = { college: true };
const COLLEGE_ADMIN = { roles: ADMINS, college: true };

// ===========================================================================
// Pagination / filtering / ordering
// ===========================================================================

function compareValues(a, b) {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** Comparator from a list of getters (ascending). */
const sortBy = (...getters) => (x, y) => {
  for (const g of getters) {
    const c = compareValues(g(x), g(y));
    if (c !== 0) return c;
  }
  return 0;
};

/**
 * items: serialized objects. config:
 *   search: [getter...]       fields matched case-insensitively by `search`
 *   ordering: { name: getter }  allowed `ordering` values
 *   defaultSort: comparator
 */
function paginate(ctx, items, { search = [], ordering = {}, defaultSort } = {}) {
  const q = ctx.query;
  let rows = [...items];

  const term = (q.get('search') || '').trim().toLowerCase();
  if (term && search.length) {
    rows = rows.filter((r) => search.some((g) => String(g(r) ?? '').toLowerCase().includes(term)));
  }

  if (defaultSort) rows.sort(defaultSort);
  const orderParam = (q.get('ordering') || '').trim();
  if (orderParam) {
    const keys = orderParam
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean)
      .map((k) => ({ desc: k.startsWith('-'), getter: ordering[k.replace(/^-/, '')] }))
      .filter((k) => k.getter);
    if (keys.length) {
      rows.sort((x, y) => {
        for (const k of keys) {
          const c = compareValues(k.getter(x), k.getter(y));
          if (c !== 0) return k.desc ? -c : c;
        }
        return defaultSort ? defaultSort(x, y) : 0;
      });
    }
  }

  let pageSize = parseInt(q.get('page_size') || '', 10);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = 20;
  if (pageSize > 200) pageSize = 200;

  const pageRaw = q.get('page');
  let page = 1;
  if (pageRaw !== null && pageRaw !== '') {
    page = Number(pageRaw);
    if (!Number.isInteger(page) || page < 1) throw notFound('Invalid page.');
  }

  const count = rows.length;
  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  if (page > totalPages) throw notFound('Invalid page.');

  return json({
    count,
    page,
    page_size: pageSize,
    total_pages: totalPages,
    results: rows.slice((page - 1) * pageSize, page * pageSize),
  });
}

const parseBoolParam = (val) => {
  if (val === null || val === '') return undefined;
  const v = val.toLowerCase();
  if (['true', '1', 'yes'].includes(v)) return true;
  if (['false', '0', 'no'].includes(v)) return false;
  return undefined;
};

const statusFilter = (ctx) => {
  const s = (ctx.query.get('status') || '').trim().toUpperCase();
  return s || null;
};

// ===========================================================================
// Serializers (§5)
// ===========================================================================

const userSummary = (u) => (u ? { id: u.id, name: u.name, email: u.email } : null);

const semesterRef = (sem) => (sem ? { id: sem.id, semester_number: sem.semester_number } : null);
const sectionRef = (sec) => (sec ? { id: sec.id, name: sec.name } : null);
const subjectRef = (sub) => (sub ? { id: sub.id, code: sub.code, name: sub.name } : null);

/** Faculty summary uses the faculty id (not the user id) — it's what `faculty_id` fields expect. */
function facultySummary(facultyId) {
  const f = byId(getDb().faculty, facultyId);
  if (!f) return null;
  const u = facultyUser(f);
  return u ? { id: f.id, name: u.name, email: u.email } : null;
}

function serializeMe(user) {
  const db = getDb();
  const college = user.college_id ? collegeById(user.college_id) : null;
  let faculty = null;
  let student = null;
  if (user.role === 'FACULTY') {
    const f = db.faculty.find((x) => x.user_id === user.id);
    faculty = f ? { id: f.id } : null;
  }
  if (user.role === 'STUDENT') {
    const s = db.students.find((x) => x.user_id === user.id);
    if (s) {
      const section = byId(db.sections, s.section_id);
      student = {
        id: s.id,
        roll_number: s.roll_number,
        semester: section ? semesterRef(sectionSemester(section)) : null,
        section: sectionRef(section),
      };
    }
  }
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    role: user.role,
    status: user.status,
    must_change_password: user.must_change_password,
    last_login_at: user.last_login_at,
    college: college ? { id: college.id, name: college.name, code: college.code } : null,
    faculty,
    student,
  };
}

function serializeCollege(c, { withAdmin = false, withStats = false } = {}) {
  const db = getDb();
  const out = {
    id: c.id,
    name: c.name,
    code: c.code,
    status: c.status,
    contact_email: c.contact_email,
    contact_phone: c.contact_phone,
    address: c.address,
  };
  if (withAdmin) {
    const a = collegeAdminUser(c.id);
    out.admin = a ? { id: a.id, name: a.name, email: a.email, status: a.status } : null;
  }
  if (withStats) {
    out.stats = {
      faculty: inCollege(db.faculty, c.id).length,
      students: inCollege(db.students, c.id).length,
      semesters: inCollege(db.semesters, c.id).length,
    };
  }
  out.created_at = c.created_at;
  out.updated_at = c.updated_at;
  return out;
}

const serializePlatformCollege = (c) => serializeCollege(c, { withAdmin: true, withStats: true });

function serializeCollegeAdmin(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    status: u.status,
    must_change_password: u.must_change_password,
    activated_at: u.activated_at,
    last_login_at: u.last_login_at,
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

function serializeSettings(s) {
  return {
    min_team_size: s.min_team_size,
    max_team_size: s.max_team_size,
    default_mentor_capacity: s.default_mentor_capacity,
    team_formation_enabled: s.team_formation_enabled,
    teams_locked: s.teams_locked,
    teams_locked_at: s.teams_locked_at,
    allow_cross_section_evaluation: s.allow_cross_section_evaluation,
    updated_by: userSummary(userById(s.updated_by_id)),
    updated_at: s.updated_at,
  };
}

function teachingFor(facultyId) {
  const db = getDb();
  return db.sectionSubjects
    .filter((m) => m.faculty_id === facultyId)
    .map((m) => {
      const section = byId(db.sections, m.section_id);
      const offering = byId(db.semesterSubjects, m.semester_subject_id);
      const subject = offering ? byId(db.subjects, offering.subject_id) : null;
      const sem = section ? sectionSemester(section) : null;
      return {
        section_subject_id: m.id,
        semester_number: sem ? sem.semester_number : null,
        section_name: section ? section.name : null,
        subject_code: subject ? subject.code : null,
        subject_name: subject ? subject.name : null,
      };
    })
    .sort(sortBy((t) => -t.semester_number, (t) => t.section_name, (t) => t.subject_code));
}

function serializeFaculty(f, { detail = false } = {}) {
  const db = getDb();
  const u = facultyUser(f);
  const classTeacherOf = db.sections
    .filter((s) => s.class_teacher_id === f.id)
    .map((s) => {
      const sem = sectionSemester(s);
      return {
        section_id: s.id,
        section_name: s.name,
        semester_id: s.semester_id,
        semester_number: sem ? sem.semester_number : null,
      };
    })
    .sort(sortBy((x) => x.semester_number, (x) => x.section_name));
  const out = {
    id: f.id,
    user_id: f.user_id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    status: u.status,
    must_change_password: u.must_change_password,
    activated_at: u.activated_at,
    last_login_at: u.last_login_at,
    class_teacher_of: classTeacherOf,
    teaching_count: db.sectionSubjects.filter((m) => m.faculty_id === f.id).length,
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
  if (detail) out.teaching = teachingFor(f.id);
  return out;
}

function serializeStudent(s) {
  const db = getDb();
  const u = studentUser(s);
  const section = byId(db.sections, s.section_id);
  return {
    id: s.id,
    user_id: s.user_id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    roll_number: s.roll_number,
    status: u.status,
    must_change_password: u.must_change_password,
    activated_at: u.activated_at,
    last_login_at: u.last_login_at,
    semester: section ? semesterRef(sectionSemester(section)) : null,
    section: sectionRef(section),
    created_at: u.created_at,
    updated_at: u.updated_at,
  };
}

function serializeSemester(sem) {
  const db = getDb();
  const sections = sectionsInSemester(sem.id);
  const sectionIds = new Set(sections.map((s) => s.id));
  return {
    id: sem.id,
    semester_number: sem.semester_number,
    sections_count: sections.length,
    subjects_count: db.semesterSubjects.filter((o) => o.semester_id === sem.id).length,
    students_count: db.students.filter((s) => sectionIds.has(s.section_id)).length,
    created_at: sem.created_at,
    updated_at: sem.updated_at,
  };
}

function serializeSubject(sub) {
  const db = getDb();
  const offeredIn = db.semesterSubjects
    .filter((o) => o.subject_id === sub.id)
    .map((o) => byId(db.semesters, o.semester_id))
    .filter(Boolean)
    .map((sem) => sem.semester_number)
    .sort((a, b) => a - b);
  return {
    id: sub.id,
    code: sub.code,
    name: sub.name,
    offered_in: offeredIn,
    created_at: sub.created_at,
    updated_at: sub.updated_at,
  };
}

function serializeSection(sec) {
  const db = getDb();
  const subjects = db.sectionSubjects
    .filter((m) => m.section_id === sec.id)
    .map((m) => {
      const offering = byId(db.semesterSubjects, m.semester_subject_id);
      const subject = offering ? byId(db.subjects, offering.subject_id) : null;
      return {
        section_subject_id: m.id,
        subject_code: subject ? subject.code : null,
        subject_name: subject ? subject.name : null,
        faculty: facultySummary(m.faculty_id),
      };
    })
    .sort(sortBy((x) => x.subject_code));
  return {
    id: sec.id,
    name: sec.name,
    semester: semesterRef(sectionSemester(sec)),
    class_teacher: facultySummary(sec.class_teacher_id),
    students_count: studentsInSection(sec.id).length,
    subjects,
    created_at: sec.created_at,
    updated_at: sec.updated_at,
  };
}

function serializeSemesterSubject(o) {
  const db = getDb();
  const sections = db.sectionSubjects
    .filter((m) => m.semester_subject_id === o.id)
    .map((m) => {
      const section = byId(db.sections, m.section_id);
      return {
        section_subject_id: m.id,
        section_id: m.section_id,
        section_name: section ? section.name : null,
        faculty: facultySummary(m.faculty_id),
      };
    })
    .sort(sortBy((x) => x.section_name));
  return {
    id: o.id,
    semester: semesterRef(byId(db.semesters, o.semester_id)),
    subject: subjectRef(byId(db.subjects, o.subject_id)),
    sections,
    created_at: o.created_at,
  };
}

function serializeSectionSubject(m) {
  const db = getDb();
  const section = byId(db.sections, m.section_id);
  const offering = byId(db.semesterSubjects, m.semester_subject_id);
  return {
    id: m.id,
    semester: section ? semesterRef(sectionSemester(section)) : null,
    section: sectionRef(section),
    semester_subject_id: m.semester_subject_id,
    subject: offering ? subjectRef(byId(db.subjects, offering.subject_id)) : null,
    faculty: facultySummary(m.faculty_id),
    faculty_assigned_at: m.faculty_id ? m.faculty_assigned_at : null,
    created_at: m.created_at,
    updated_at: m.updated_at,
  };
}

// ===========================================================================
// Domain helpers (account lifecycle, cascades)
// ===========================================================================

function generateTempPassword() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  let pw = '';
  for (let i = 0; i < 6; i += 1) pw += letters[Math.floor(Math.random() * letters.length)];
  pw += '@';
  for (let i = 0; i < 3; i += 1) pw += digits[Math.floor(Math.random() * digits.length)];
  return pw;
}

/** Simulates the credentials email: new temp password, must_change_password=true. */
function issueCredentials(user) {
  const pw = generateTempPassword();
  user.password = pw;
  user.must_change_password = true;
  user.updated_at = nowIso();
  console.info('[mock] Credentials email for', user.email, '— temporary password:', pw);
}

function activateUser(user) {
  user.status = 'ACTIVE';
  user.activated_at = nowIso();
  issueCredentials(user);
}

function deactivateUser(user) {
  user.status = 'INACTIVE';
  user.updated_at = nowIso();
  revokeSessionsFor(user.id);
}

function resendCredentials(user) {
  if (user.status !== 'ACTIVE') throw conflict('Credentials can only be resent to active users.');
  issueCredentials(user);
  revokeSessionsFor(user.id);
}

function newUser({ email, name, phone, role, collegeId }) {
  const ts = nowIso();
  return {
    id: uid('users'),
    email,
    name,
    phone: phone ?? null,
    role,
    status: 'INACTIVE',
    password: null,
    must_change_password: true,
    college_id: collegeId,
    activated_at: null,
    last_login_at: null,
    created_at: ts,
    updated_at: ts,
  };
}

function assertEmailFree(email) {
  if (findUserByEmail(email)) {
    throw conflict('A user with this email already exists.', { email: ['A user with this email already exists.'] });
  }
}

function removeUser(userId) {
  const db = getDb();
  db.users = db.users.filter((u) => u.id !== userId);
  revokeSessionsFor(userId);
}

function deleteSectionSubjectsWhere(pred) {
  const db = getDb();
  db.sectionSubjects = db.sectionSubjects.filter((m) => !pred(m));
}

function deleteSemesterSubject(offeringId) {
  const db = getDb();
  deleteSectionSubjectsWhere((m) => m.semester_subject_id === offeringId);
  db.semesterSubjects = db.semesterSubjects.filter((o) => o.id !== offeringId);
}

function deleteSection(sectionId) {
  const db = getDb();
  deleteSectionSubjectsWhere((m) => m.section_id === sectionId);
  db.sections = db.sections.filter((s) => s.id !== sectionId);
}

function deleteSemester(semesterId) {
  const db = getDb();
  sectionsInSemester(semesterId).forEach((s) => deleteSection(s.id));
  db.semesterSubjects.filter((o) => o.semester_id === semesterId).forEach((o) => deleteSemesterSubject(o.id));
  db.semesters = db.semesters.filter((s) => s.id !== semesterId);
}

function deleteSubject(subjectId) {
  const db = getDb();
  db.semesterSubjects.filter((o) => o.subject_id === subjectId).forEach((o) => deleteSemesterSubject(o.id));
  db.subjects = db.subjects.filter((s) => s.id !== subjectId);
}

function deleteFaculty(f) {
  const db = getDb();
  const ts = nowIso();
  db.sections.forEach((s) => {
    if (s.class_teacher_id === f.id) {
      s.class_teacher_id = null;
      s.updated_at = ts;
    }
  });
  db.sectionSubjects.forEach((m) => {
    if (m.faculty_id === f.id) {
      m.faculty_id = null;
      m.faculty_assigned_at = null;
      m.updated_at = ts;
    }
  });
  db.faculty = db.faculty.filter((x) => x.id !== f.id);
  removeUser(f.user_id);
}

function deleteStudent(s) {
  const db = getDb();
  db.students = db.students.filter((x) => x.id !== s.id);
  removeUser(s.user_id);
}

function deleteCollege(collegeId) {
  const db = getDb();
  const keep = (x) => x.college_id !== collegeId;
  const session = readSession();
  if (session && db.users.some((u) => u.id === session && u.college_id === collegeId)) writeSession(null);
  db.users = db.users.filter(keep);
  db.settings = db.settings.filter(keep);
  db.faculty = db.faculty.filter(keep);
  db.students = db.students.filter(keep);
  db.semesters = db.semesters.filter(keep);
  db.subjects = db.subjects.filter(keep);
  db.sections = db.sections.filter(keep);
  db.semesterSubjects = db.semesterSubjects.filter(keep);
  db.sectionSubjects = db.sectionSubjects.filter(keep);
  db.colleges = db.colleges.filter((c) => c.id !== collegeId);
}

/** Validates that a faculty id can be assigned (exists in college, ACTIVE). Adds errors to `v`. */
function resolveAssignableFaculty(v, field, facultyId, collegeId) {
  if (facultyId === undefined || facultyId === null) return null;
  const f = getInCollege(getDb().faculty, facultyId, collegeId);
  if (!f) {
    v.add(field, 'Faculty not found.');
    return null;
  }
  const u = facultyUser(f);
  if (!u || u.status !== 'ACTIVE') {
    v.add(field, 'Inactive faculty cannot be assigned.');
    return null;
  }
  return f;
}

/** 409 if faculty is already class teacher of another section in the same semester. */
function assertClassTeacherSlotFree(facultyId, semesterId, exceptSectionId, field) {
  const other = getDb().sections.find(
    (s) => s.class_teacher_id === facultyId && s.semester_id === semesterId && s.id !== exceptSectionId,
  );
  if (other) {
    const sem = byId(getDb().semesters, semesterId);
    const f = facultySummary(facultyId);
    const msg = `${f ? f.name : 'This faculty member'} is already class teacher of Section ${other.name} in Semester ${sem ? sem.semester_number : ''}.`.replace(' .', '.');
    throw conflict(msg, { [field]: [msg] });
  }
}

const requireFound = (item, what = 'Not found.') => {
  if (!item) throw notFound(what);
  return item;
};

// ===========================================================================
// Handlers: system & auth (§7, §18)
// ===========================================================================

const systemHandlers = [
  route('get', '/health/', PUBLIC, () => json({ status: 'ok', time: nowIso() })),
];

const authHandlers = [
  route('get', '/auth/csrf/', PUBLIC, () => {
    let token = readCookieSafe('csrftoken');
    if (!token) {
      token = randomToken();
      try {
        document.cookie = `csrftoken=${token}; path=/; max-age=31536000; SameSite=Lax`;
      } catch {
        /* non-browser environment */
      }
    }
    return empty(204);
  }),

  route('post', '/auth/login/', PUBLIC, ({ body }) => {
    const v = makeValidator();
    const email = cleanString(v, body, 'email', { required: true, max: 254 });
    if (typeof body.password !== 'string' || body.password === '') v.add('password', 'This field is required.');
    v.throwIfAny();
    const user = findUserByEmail(email.toLowerCase());
    if (!user || !user.password || user.password !== body.password) {
      throw apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
    }
    if (user.status !== 'ACTIVE') throw apiError(403, 'ACCOUNT_INACTIVE', 'Your account is inactive. Contact your administrator.');
    if (user.college_id) {
      const college = collegeById(user.college_id);
      if (!college || college.status !== 'ACTIVE') {
        throw apiError(403, 'COLLEGE_INACTIVE', 'Your college is currently inactive.');
      }
    }
    user.last_login_at = nowIso();
    writeSession(user.id);
    return json({ user: serializeMe(user) });
  }),

  route('post', '/auth/refresh/', PUBLIC, () => {
    if (!sessionUser()) throw apiError(401, 'REFRESH_INVALID', 'Session expired. Please log in again.');
    return empty(204);
  }),

  route('post', '/auth/logout/', PUBLIC, () => {
    writeSession(null);
    return empty(204);
  }),

  route('post', '/auth/change-password/', { allowPasswordChange: true }, ({ body, user }) => {
    const v = makeValidator();
    if (typeof body.current_password !== 'string' || body.current_password === '') {
      v.add('current_password', 'This field is required.');
    } else if (body.current_password !== user.password) {
      v.add('current_password', 'Current password is incorrect.');
    }
    if (typeof body.new_password !== 'string' || body.new_password === '') {
      v.add('new_password', 'This field is required.');
    } else {
      passwordProblems(body.new_password, user).forEach((m) => v.add('new_password', m));
      if (!v.has('new_password') && body.new_password === user.password) {
        v.add('new_password', 'New password must be different from the current password.');
      }
    }
    v.throwIfAny();
    user.password = body.new_password;
    user.must_change_password = false;
    user.updated_at = nowIso();
    return json({ user: serializeMe(user) });
  }),

  route('post', '/auth/password-reset/request/', PUBLIC, ({ body }) => {
    const v = makeValidator();
    const email = cleanEmail(v, body, 'email');
    v.throwIfAny();
    const user = findUserByEmail(email);
    const college = user && user.college_id ? collegeById(user.college_id) : null;
    const eligible = user && user.status === 'ACTIVE' && (!user.college_id || (college && college.status === 'ACTIVE'));
    if (eligible) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      getDb().passwordResets[email] = { otp, expires_at: Date.now() + OTP_TTL_MS, attempts: 0 };
      console.info('[mock] OTP for', email, otp);
    } else {
      console.info('[mock] Password reset requested for unknown/inactive email', email, '(no OTP sent)');
    }
    return empty(202);
  }),

  route('post', '/auth/password-reset/verify/', PUBLIC, ({ body }) => {
    const v = makeValidator();
    const email = cleanEmail(v, body, 'email');
    const otp = cleanString(v, body, 'otp', { required: true, max: 6 });
    v.throwIfAny();
    const db = getDb();
    const entry = db.passwordResets[email];
    const invalid = () => validationError({ otp: ['Invalid or expired code.'] }, 'Invalid or expired code.');
    if (!entry || entry.expires_at < Date.now()) {
      delete db.passwordResets[email];
      throw invalid();
    }
    if (entry.otp !== otp) {
      entry.attempts += 1;
      if (entry.attempts >= 5) delete db.passwordResets[email];
      throw invalid();
    }
    delete db.passwordResets[email];
    const user = findUserByEmail(email);
    if (!user) throw invalid();
    const token = randomToken();
    db.resetTokens[token] = { user_id: user.id, expires_at: Date.now() + RESET_TOKEN_TTL_S * 1000 };
    return json({ reset_token: token, expires_in: RESET_TOKEN_TTL_S });
  }),

  route('post', '/auth/password-reset/confirm/', PUBLIC, ({ body }) => {
    const db = getDb();
    const v = makeValidator();
    const token = typeof body.reset_token === 'string' ? body.reset_token : '';
    const entry = token ? db.resetTokens[token] : null;
    const user = entry && entry.expires_at >= Date.now() ? userById(entry.user_id) : null;
    if (!token) v.add('reset_token', 'This field is required.');
    else if (!user) v.add('reset_token', 'Invalid or expired reset token.');
    if (typeof body.new_password !== 'string' || body.new_password === '') {
      v.add('new_password', 'This field is required.');
    } else {
      passwordProblems(body.new_password, user).forEach((m) => v.add('new_password', m));
    }
    v.throwIfAny();
    user.password = body.new_password;
    user.must_change_password = false;
    user.updated_at = nowIso();
    delete db.resetTokens[token];
    revokeSessionsFor(user.id);
    return empty(204);
  }),
];

function readCookieSafe(name) {
  try {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
  } catch {
    return null;
  }
}

// ===========================================================================
// Handlers: /me (§8)
// ===========================================================================

const meHandlers = [
  route('get', '/me/', { allowPasswordChange: true }, ({ user }) => json(serializeMe(user))),

  route('patch', '/me/', {}, ({ body, user }) => {
    const v = makeValidator();
    rejectReadOnly(v, body, [
      'email', 'role', 'status', 'roll_number', 'section', 'section_id', 'semester', 'semester_id', 'must_change_password', 'college',
    ]);
    const name = cleanString(v, body, 'name', { required: true, partial: true, max: 150 });
    const phone = cleanPhone(v, body, 'phone');
    v.throwIfAny();
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    user.updated_at = nowIso();
    return json(serializeMe(user));
  }),
];

// ===========================================================================
// Handlers: platform — colleges & college admins (§9)
// ===========================================================================

function cleanCollegeCode(v, body, { partial = false } = {}) {
  const code = cleanString(v, body, 'code', { required: true, partial, min: 2, max: 50 });
  if (code === undefined || code === null) return code;
  const upper = code.toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(upper)) {
    v.add('code', 'Only letters A–Z, digits 0–9 and "-" are allowed.');
    return undefined;
  }
  return upper;
}

function assertCollegeCodeFree(code, exceptId) {
  if (getDb().colleges.some((c) => c.code === code && c.id !== exceptId)) {
    throw conflict('A college with this code already exists.', { code: ['A college with this code already exists.'] });
  }
}

function cleanCollegeFields(v, body, partial) {
  const out = {
    name: cleanString(v, body, 'name', { required: true, partial, max: 200 }),
    code: cleanCollegeCode(v, body, { partial }),
    contact_email: cleanEmail(v, body, 'contact_email', { required: false }),
    contact_phone: cleanPhone(v, body, 'contact_phone'),
    address: cleanString(v, body, 'address', { partial, max: 1000 }),
  };
  if (!partial) {
    if (out.contact_email === undefined && !v.has('contact_email')) out.contact_email = null;
    if (out.contact_phone === undefined && !v.has('contact_phone')) out.contact_phone = null;
    if (out.address === undefined || out.address === null) out.address = '';
  } else if (out.address === null) {
    out.address = '';
  }
  return out;
}

const platformCollege = (params) => requireFound(collegeById(params.id), 'College not found.');

function platformAdminOf(college) {
  return requireFound(collegeAdminUser(college.id), 'This college has no admin yet.');
}

const platformHandlers = [
  route('get', '/platform/colleges/', SUPER_ONLY, (ctx) => {
    const status = statusFilter(ctx);
    const rows = getDb()
      .colleges.filter((c) => !status || c.status === status)
      .map(serializePlatformCollege);
    return paginate(ctx, rows, {
      search: [(c) => c.name, (c) => c.code],
      ordering: { name: (c) => c.name, created_at: (c) => c.created_at, code: (c) => c.code, status: (c) => c.status },
      defaultSort: sortBy((c) => c.name),
    });
  }),

  route('post', '/platform/colleges/', SUPER_ONLY, ({ body }) => {
    const v = makeValidator();
    const fields = cleanCollegeFields(v, body, false);
    v.throwIfAny();
    assertCollegeCodeFree(fields.code);
    const ts = nowIso();
    const college = { id: uid('colleges'), ...fields, status: 'ACTIVE', created_at: ts, updated_at: ts };
    const db = getDb();
    db.colleges.push(college);
    db.settings.push({
      college_id: college.id,
      min_team_size: 2,
      max_team_size: 4,
      default_mentor_capacity: 5,
      team_formation_enabled: false,
      teams_locked: false,
      teams_locked_at: null,
      allow_cross_section_evaluation: false,
      updated_by_id: null,
      updated_at: ts,
    });
    return json(serializePlatformCollege(college), 201);
  }),

  route('get', '/platform/colleges/:id/', SUPER_ONLY, ({ params }) => json(serializePlatformCollege(platformCollege(params)))),

  route('patch', '/platform/colleges/:id/', SUPER_ONLY, ({ params, body }) => {
    const college = platformCollege(params);
    const v = makeValidator();
    const fields = cleanCollegeFields(v, body, true);
    v.throwIfAny();
    if (fields.code !== undefined) assertCollegeCodeFree(fields.code, college.id);
    Object.entries(fields).forEach(([k, val]) => {
      if (val !== undefined) college[k] = val;
    });
    college.updated_at = nowIso();
    return json(serializePlatformCollege(college));
  }),

  route('delete', '/platform/colleges/:id/', SUPER_ONLY, ({ params, query }) => {
    const college = platformCollege(params);
    const confirm = (query.get('confirm') || '').trim();
    if (!confirm || confirm.toUpperCase() !== college.code) {
      throw validationError(
        { confirm: [`Type the college code (${college.code}) to confirm deletion.`] },
        'Confirmation code does not match.',
      );
    }
    deleteCollege(college.id);
    return empty(204);
  }),

  route('post', '/platform/colleges/:id/activate/', SUPER_ONLY, ({ params }) => {
    const college = platformCollege(params);
    college.status = 'ACTIVE';
    college.updated_at = nowIso();
    return json(serializePlatformCollege(college));
  }),

  route('post', '/platform/colleges/:id/deactivate/', SUPER_ONLY, ({ params }) => {
    const college = platformCollege(params);
    college.status = 'INACTIVE';
    college.updated_at = nowIso();
    // Sessions of the college's users are revoked implicitly: sessionUser() rejects inactive colleges.
    return json(serializePlatformCollege(college));
  }),

  // --- College admin sub-resource ---------------------------------------
  route('get', '/platform/colleges/:id/admin/', SUPER_ONLY, ({ params }) =>
    json(serializeCollegeAdmin(platformAdminOf(platformCollege(params)))),
  ),

  route('post', '/platform/colleges/:id/admin/', SUPER_ONLY, ({ params, body }) => {
    const college = platformCollege(params);
    const v = makeValidator();
    const name = cleanString(v, body, 'name', { required: true, max: 150 });
    const email = cleanEmail(v, body, 'email');
    const phone = cleanPhone(v, body, 'phone');
    v.throwIfAny();
    if (collegeAdminUser(college.id)) throw conflict('This college already has an admin.');
    assertEmailFree(email);
    const user = newUser({ email, name, phone, role: 'ADMIN', collegeId: college.id });
    getDb().users.push(user);
    return json(serializeCollegeAdmin(user), 201);
  }),

  route('patch', '/platform/colleges/:id/admin/', SUPER_ONLY, ({ params, body }) => {
    const admin = platformAdminOf(platformCollege(params));
    const v = makeValidator();
    rejectReadOnly(v, body, ['email'], 'Email cannot be changed.');
    const name = cleanString(v, body, 'name', { required: true, partial: true, max: 150 });
    const phone = cleanPhone(v, body, 'phone');
    v.throwIfAny();
    if (name !== undefined) admin.name = name;
    if (phone !== undefined) admin.phone = phone;
    admin.updated_at = nowIso();
    return json(serializeCollegeAdmin(admin));
  }),

  route('delete', '/platform/colleges/:id/admin/', SUPER_ONLY, ({ params }) => {
    const admin = platformAdminOf(platformCollege(params));
    getDb().settings.forEach((s) => {
      if (s.updated_by_id === admin.id) s.updated_by_id = null;
    });
    removeUser(admin.id);
    return empty(204);
  }),

  route('post', '/platform/colleges/:id/admin/activate/', SUPER_ONLY, ({ params }) => {
    const admin = platformAdminOf(platformCollege(params));
    if (admin.status !== 'ACTIVE') activateUser(admin);
    return json(serializeCollegeAdmin(admin));
  }),

  route('post', '/platform/colleges/:id/admin/deactivate/', SUPER_ONLY, ({ params }) => {
    const admin = platformAdminOf(platformCollege(params));
    if (admin.status !== 'INACTIVE') deactivateUser(admin);
    return json(serializeCollegeAdmin(admin));
  }),

  route('post', '/platform/colleges/:id/admin/resend-credentials/', SUPER_ONLY, ({ params }) => {
    resendCredentials(platformAdminOf(platformCollege(params)));
    return empty(202);
  }),
];

// ===========================================================================
// Handlers: college & settings (§10)
// ===========================================================================

const collegeHandlers = [
  route('get', '/college/', COLLEGE_ANY, ({ college, user }) => {
    const isAdmin = ADMINS.includes(user.role);
    return json(serializeCollege(college, { withAdmin: isAdmin, withStats: isAdmin }));
  }),

  route('get', '/settings/', COLLEGE_ANY, ({ college }) => {
    let s = settingsFor(college.id);
    if (!s) {
      s = { college_id: college.id, min_team_size: 2, max_team_size: 4, default_mentor_capacity: 5, team_formation_enabled: false, teams_locked: false, teams_locked_at: null, allow_cross_section_evaluation: false, updated_by_id: null, updated_at: nowIso() };
      getDb().settings.push(s);
    }
    return json(serializeSettings(s));
  }),

  route('patch', '/settings/', COLLEGE_ADMIN, ({ college, body, user }) => {
    const s = settingsFor(college.id);
    if (!s) throw notFound('Settings not found.');
    const v = makeValidator();
    rejectReadOnly(v, body, ['teams_locked_at', 'updated_by', 'updated_at']);
    const min = cleanInt(v, body, 'min_team_size', { partial: true, min: 2 });
    const max = cleanInt(v, body, 'max_team_size', { partial: true, max: 20 });
    const cap = cleanInt(v, body, 'default_mentor_capacity', { partial: true, min: 1, max: 100 });
    const tfe = cleanBool(v, body, 'team_formation_enabled');
    const locked = cleanBool(v, body, 'teams_locked');
    const cross = cleanBool(v, body, 'allow_cross_section_evaluation');
    const effMin = min ?? s.min_team_size;
    const effMax = max ?? s.max_team_size;
    if (!v.has('min_team_size') && !v.has('max_team_size') && effMax < effMin) {
      v.add('max_team_size', 'Maximum team size must be greater than or equal to minimum team size.');
    }
    v.throwIfAny();
    const ts = nowIso();
    if (min !== undefined) s.min_team_size = min;
    if (max !== undefined) s.max_team_size = max;
    if (cap !== undefined) s.default_mentor_capacity = cap;
    if (tfe !== undefined) s.team_formation_enabled = tfe;
    if (cross !== undefined) s.allow_cross_section_evaluation = cross;
    if (locked !== undefined) {
      if (locked && !s.teams_locked) s.teams_locked_at = ts;
      if (!locked) s.teams_locked_at = null;
      s.teams_locked = locked;
    }
    s.updated_by_id = user.id;
    s.updated_at = ts;
    return json(serializeSettings(s));
  }),
];

// ===========================================================================
// Status actions shared by faculty & students
// ===========================================================================

function bulkApply(records, ids, target) {
  const result = { succeeded: [], failed: [] };
  ids.forEach((id) => {
    const rec = records.find((r) => r.id === id);
    const user = rec ? userById(rec.user_id) : null;
    if (!rec || !user) {
      result.failed.push({ id, code: 'NOT_FOUND', message: 'Not found.' });
    } else if (user.status === target) {
      result.failed.push(
        target === 'ACTIVE'
          ? { id, code: 'ALREADY_ACTIVE', message: 'Already active.' }
          : { id, code: 'ALREADY_INACTIVE', message: 'Already inactive.' },
      );
    } else {
      if (target === 'ACTIVE') activateUser(user);
      else deactivateUser(user);
      result.succeeded.push(id);
    }
  });
  return result;
}

function validateIdList(v, body, field = 'ids') {
  const ids = body[field];
  if (!Array.isArray(ids)) {
    v.add(field, 'Expected a list of ids.');
    return [];
  }
  if (ids.length === 0) v.add(field, 'This list may not be empty.');
  if (ids.length > 500) v.add(field, 'Ensure this list has no more than 500 items.');
  const parsed = ids.map(toId);
  if (parsed.some((x) => !x)) v.add(field, 'Every id must be an integer.');
  return [...new Set(parsed)];
}

/**
 * Builds activate/deactivate/resend/bulk handlers for faculty or students.
 * getRecords(collegeId) → records with user_id; serialize(record) → response object.
 * bulkFilters: allow { section_id } / { semester_id } instead of ids (students).
 */
function statusActionHandlers(prefix, getTable, serialize, { bulkFilters = false } = {}) {
  const getRecord = (ctx) => requireFound(getInCollege(getTable(), ctx.params.id, ctx.college.id));

  const resolveBulkIds = (ctx) => {
    const { body, college } = ctx;
    const v = makeValidator();
    if (!bulkFilters) {
      const ids = validateIdList(v, body);
      v.throwIfAny();
      return ids;
    }
    const provided = ['ids', 'section_id', 'semester_id'].filter((k) => present(body, k) && body[k] !== null);
    if (provided.length !== 1) {
      throw validationError({ non_field_errors: ['Provide exactly one of ids, section_id, semester_id.'] });
    }
    const db = getDb();
    if (provided[0] === 'ids') {
      const ids = validateIdList(v, body);
      v.throwIfAny();
      return ids;
    }
    if (provided[0] === 'section_id') {
      const section = getInCollege(db.sections, body.section_id, college.id);
      if (!section) throw validationError({ section_id: ['Section not found.'] });
      return studentsInSection(section.id).map((s) => s.id);
    }
    const semester = getInCollege(db.semesters, body.semester_id, college.id);
    if (!semester) throw validationError({ semester_id: ['Semester not found.'] });
    const sectionIds = new Set(sectionsInSemester(semester.id).map((s) => s.id));
    return db.students.filter((s) => sectionIds.has(s.section_id)).map((s) => s.id);
  };

  return [
    route('post', `${prefix}bulk-activate/`, COLLEGE_ADMIN, (ctx) =>
      json(bulkApply(inCollege(getTable(), ctx.college.id), resolveBulkIds(ctx), 'ACTIVE')),
    ),
    route('post', `${prefix}bulk-deactivate/`, COLLEGE_ADMIN, (ctx) =>
      json(bulkApply(inCollege(getTable(), ctx.college.id), resolveBulkIds(ctx), 'INACTIVE')),
    ),
    route('post', `${prefix}:id/activate/`, COLLEGE_ADMIN, (ctx) => {
      const rec = getRecord(ctx);
      const user = userById(rec.user_id);
      if (user.status !== 'ACTIVE') activateUser(user);
      return json(serialize(rec));
    }),
    route('post', `${prefix}:id/deactivate/`, COLLEGE_ADMIN, (ctx) => {
      const rec = getRecord(ctx);
      const user = userById(rec.user_id);
      if (user.status !== 'INACTIVE') deactivateUser(user);
      return json(serialize(rec));
    }),
    route('post', `${prefix}:id/resend-credentials/`, COLLEGE_ADMIN, (ctx) => {
      resendCredentials(userById(getRecord(ctx).user_id));
      return empty(202);
    }),
  ];
}

// ===========================================================================
// Handlers: faculty (§11)
// ===========================================================================

const facultyHandlers = [
  ...statusActionHandlers('/faculty/', () => getDb().faculty, (f) => serializeFaculty(f)),

  route('get', '/faculty/', COLLEGE_ADMIN, (ctx) => {
    const status = statusFilter(ctx);
    const rows = inCollege(getDb().faculty, ctx.college.id)
      .map((f) => serializeFaculty(f))
      .filter((f) => !status || f.status === status);
    return paginate(ctx, rows, {
      search: [(f) => f.name, (f) => f.email],
      ordering: { name: (f) => f.name, created_at: (f) => f.created_at, last_login_at: (f) => f.last_login_at, email: (f) => f.email, status: (f) => f.status },
      defaultSort: sortBy((f) => f.name),
    });
  }),

  route('post', '/faculty/', COLLEGE_ADMIN, ({ body, college }) => {
    const v = makeValidator();
    const name = cleanString(v, body, 'name', { required: true, max: 150 });
    const email = cleanEmail(v, body, 'email');
    const phone = cleanPhone(v, body, 'phone');
    v.throwIfAny();
    assertEmailFree(email);
    const db = getDb();
    const user = newUser({ email, name, phone, role: 'FACULTY', collegeId: college.id });
    db.users.push(user);
    const f = { id: uid('faculty'), user_id: user.id, college_id: college.id };
    db.faculty.push(f);
    return json(serializeFaculty(f), 201);
  }),

  route('get', '/faculty/:id/', COLLEGE_ADMIN, ({ params, college }) =>
    json(serializeFaculty(requireFound(getInCollege(getDb().faculty, params.id, college.id)), { detail: true })),
  ),

  route('patch', '/faculty/:id/', COLLEGE_ADMIN, ({ params, college, body }) => {
    const f = requireFound(getInCollege(getDb().faculty, params.id, college.id));
    const user = facultyUser(f);
    const v = makeValidator();
    if (present(body, 'email') && String(body.email).trim().toLowerCase() !== user.email) {
      v.add('email', 'Email cannot be changed.');
    }
    const name = cleanString(v, body, 'name', { required: true, partial: true, max: 150 });
    const phone = cleanPhone(v, body, 'phone');
    v.throwIfAny();
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    user.updated_at = nowIso();
    return json(serializeFaculty(f, { detail: true }));
  }),

  route('delete', '/faculty/:id/', COLLEGE_ADMIN, ({ params, college }) => {
    deleteFaculty(requireFound(getInCollege(getDb().faculty, params.id, college.id)));
    return empty(204);
  }),
];

// ===========================================================================
// Handlers: students (§12)
// ===========================================================================

function assertRollFree(rollNumber, collegeId, exceptStudentId) {
  const taken = getDb().students.some(
    (s) => s.college_id === collegeId && s.id !== exceptStudentId && s.roll_number.toLowerCase() === rollNumber.toLowerCase(),
  );
  if (taken) {
    throw conflict('A student with this roll number already exists in this college.', {
      roll_number: ['A student with this roll number already exists in this college.'],
    });
  }
}

const studentHandlers = [
  ...statusActionHandlers('/students/', () => getDb().students, serializeStudent, { bulkFilters: true }),

  route('get', '/students/', COLLEGE_ADMIN, (ctx) => {
    const status = statusFilter(ctx);
    const semesterId = ctx.query.get('semester_id');
    const sectionId = ctx.query.get('section_id');
    const rows = inCollege(getDb().students, ctx.college.id)
      .map(serializeStudent)
      .filter((s) => !status || s.status === status)
      .filter((s) => !semesterId || (s.semester && s.semester.id === semesterId))
      .filter((s) => !sectionId || (s.section && s.section.id === sectionId));
    return paginate(ctx, rows, {
      search: [(s) => s.name, (s) => s.email, (s) => s.roll_number],
      ordering: {
        name: (s) => s.name,
        roll_number: (s) => s.roll_number,
        created_at: (s) => s.created_at,
        email: (s) => s.email,
        status: (s) => s.status,
        last_login_at: (s) => s.last_login_at,
      },
      defaultSort: sortBy((s) => s.roll_number),
    });
  }),

  route('post', '/students/', COLLEGE_ADMIN, ({ body, college }) => {
    const db = getDb();
    const v = makeValidator();
    const name = cleanString(v, body, 'name', { required: true, max: 150 });
    const email = cleanEmail(v, body, 'email');
    const phone = cleanPhone(v, body, 'phone');
    const roll = cleanString(v, body, 'roll_number', { required: true, max: 50 });
    const sectionId = cleanId(v, body, 'section_id');
    let section = null;
    if (sectionId) {
      section = getInCollege(db.sections, sectionId, college.id);
      if (!section) v.add('section_id', 'Section not found.');
    }
    v.throwIfAny();
    assertEmailFree(email);
    assertRollFree(roll, college.id);
    const user = newUser({ email, name, phone, role: 'STUDENT', collegeId: college.id });
    db.users.push(user);
    const s = { id: uid('students'), user_id: user.id, college_id: college.id, roll_number: roll, section_id: section.id };
    db.students.push(s);
    return json(serializeStudent(s), 201);
  }),

  route('get', '/students/:id/', COLLEGE_ADMIN, ({ params, college }) =>
    json(serializeStudent(requireFound(getInCollege(getDb().students, params.id, college.id)))),
  ),

  route('patch', '/students/:id/', COLLEGE_ADMIN, ({ params, college, body }) => {
    const db = getDb();
    const s = requireFound(getInCollege(db.students, params.id, college.id));
    const user = studentUser(s);
    const v = makeValidator();
    if (present(body, 'email') && String(body.email).trim().toLowerCase() !== user.email) {
      v.add('email', 'Email cannot be changed.');
    }
    const name = cleanString(v, body, 'name', { required: true, partial: true, max: 150 });
    const phone = cleanPhone(v, body, 'phone');
    const roll = cleanString(v, body, 'roll_number', { required: true, partial: true, max: 50 });
    let section;
    if (present(body, 'section_id')) {
      const sectionId = cleanId(v, body, 'section_id');
      if (sectionId) {
        section = getInCollege(db.sections, sectionId, college.id);
        if (!section) v.add('section_id', 'Section not found.');
      }
    }
    v.throwIfAny();
    if (roll !== undefined) assertRollFree(roll, college.id, s.id);
    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (roll !== undefined) s.roll_number = roll;
    if (section) s.section_id = section.id;
    user.updated_at = nowIso();
    return json(serializeStudent(s));
  }),

  route('delete', '/students/:id/', COLLEGE_ADMIN, ({ params, college }) => {
    deleteStudent(requireFound(getInCollege(getDb().students, params.id, college.id)));
    return empty(204);
  }),
];

// ===========================================================================
// Handlers: semesters (§13)
// ===========================================================================

function assertSemesterNumberFree(n, collegeId, exceptId) {
  if (getDb().semesters.some((s) => s.college_id === collegeId && s.semester_number === n && s.id !== exceptId)) {
    throw conflict(`Semester ${n} already exists.`, { semester_number: [`Semester ${n} already exists.`] });
  }
}

const semesterHandlers = [
  route('get', '/semesters/', COLLEGE_ADMIN, (ctx) =>
    paginate(ctx, inCollege(getDb().semesters, ctx.college.id).map(serializeSemester), {
      ordering: { semester_number: (s) => s.semester_number, created_at: (s) => s.created_at },
      defaultSort: sortBy((s) => s.semester_number),
    }),
  ),

  route('post', '/semesters/', COLLEGE_ADMIN, ({ body, college }) => {
    const v = makeValidator();
    const n = cleanInt(v, body, 'semester_number', { required: true, min: 1, max: 12 });
    v.throwIfAny();
    assertSemesterNumberFree(n, college.id);
    const ts = nowIso();
    const sem = { id: uid('semesters'), college_id: college.id, semester_number: n, created_at: ts, updated_at: ts };
    getDb().semesters.push(sem);
    return json(serializeSemester(sem), 201);
  }),

  route('get', '/semesters/:id/', COLLEGE_ADMIN, ({ params, college }) =>
    json(serializeSemester(requireFound(getInCollege(getDb().semesters, params.id, college.id)))),
  ),

  route('patch', '/semesters/:id/', COLLEGE_ADMIN, ({ params, college, body }) => {
    const sem = requireFound(getInCollege(getDb().semesters, params.id, college.id));
    const v = makeValidator();
    const n = cleanInt(v, body, 'semester_number', { partial: true, min: 1, max: 12 });
    v.throwIfAny();
    if (n !== undefined) {
      assertSemesterNumberFree(n, college.id, sem.id);
      sem.semester_number = n;
    }
    sem.updated_at = nowIso();
    return json(serializeSemester(sem));
  }),

  route('delete', '/semesters/:id/', COLLEGE_ADMIN, ({ params, college }) => {
    const sem = requireFound(getInCollege(getDb().semesters, params.id, college.id));
    const sectionIds = new Set(sectionsInSemester(sem.id).map((s) => s.id));
    const studentCount = getDb().students.filter((s) => sectionIds.has(s.section_id)).length;
    if (studentCount > 0) {
      throw hasDependents(
        `Semester ${sem.semester_number} still has ${studentCount} student${studentCount === 1 ? '' : 's'} in its sections. Move or delete them first.`,
      );
    }
    deleteSemester(sem.id);
    return empty(204);
  }),
];

// ===========================================================================
// Handlers: subjects (§14)
// ===========================================================================

function cleanSubjectCode(v, body, partial) {
  const code = cleanString(v, body, 'code', { required: true, partial, max: 50 });
  return typeof code === 'string' ? code.toUpperCase() : code;
}

function assertSubjectCodeFree(code, collegeId, exceptId) {
  if (getDb().subjects.some((s) => s.college_id === collegeId && s.code === code && s.id !== exceptId)) {
    throw conflict(`Subject code ${code} already exists.`, { code: [`Subject code ${code} already exists.`] });
  }
}

const subjectHandlers = [
  route('get', '/subjects/', COLLEGE_ADMIN, (ctx) => {
    const db = getDb();
    const semesterId = ctx.query.get('semester_id');
    let subjects = inCollege(db.subjects, ctx.college.id);
    if (semesterId) {
      const offered = new Set(db.semesterSubjects.filter((o) => o.semester_id === semesterId).map((o) => o.subject_id));
      subjects = subjects.filter((s) => offered.has(s.id));
    }
    return paginate(ctx, subjects.map(serializeSubject), {
      search: [(s) => s.code, (s) => s.name],
      ordering: { code: (s) => s.code, name: (s) => s.name, created_at: (s) => s.created_at },
      defaultSort: sortBy((s) => s.code),
    });
  }),

  route('post', '/subjects/', COLLEGE_ADMIN, ({ body, college }) => {
    const v = makeValidator();
    const code = cleanSubjectCode(v, body, false);
    const name = cleanString(v, body, 'name', { required: true, max: 200 });
    v.throwIfAny();
    assertSubjectCodeFree(code, college.id);
    const ts = nowIso();
    const sub = { id: uid('subjects'), college_id: college.id, code, name, created_at: ts, updated_at: ts };
    getDb().subjects.push(sub);
    return json(serializeSubject(sub), 201);
  }),

  route('get', '/subjects/:id/', COLLEGE_ADMIN, ({ params, college }) =>
    json(serializeSubject(requireFound(getInCollege(getDb().subjects, params.id, college.id)))),
  ),

  route('patch', '/subjects/:id/', COLLEGE_ADMIN, ({ params, college, body }) => {
    const sub = requireFound(getInCollege(getDb().subjects, params.id, college.id));
    const v = makeValidator();
    const code = cleanSubjectCode(v, body, true);
    const name = cleanString(v, body, 'name', { required: true, partial: true, max: 200 });
    v.throwIfAny();
    if (code !== undefined) assertSubjectCodeFree(code, college.id, sub.id);
    if (code !== undefined) sub.code = code;
    if (name !== undefined) sub.name = name;
    sub.updated_at = nowIso();
    return json(serializeSubject(sub));
  }),

  route('delete', '/subjects/:id/', COLLEGE_ADMIN, ({ params, college }) => {
    deleteSubject(requireFound(getInCollege(getDb().subjects, params.id, college.id)).id);
    return empty(204);
  }),
];

// ===========================================================================
// Handlers: sections & class teachers (§15)
// ===========================================================================

function cleanSectionName(v, body, partial) {
  const name = cleanString(v, body, 'name', { required: true, partial, max: 100 });
  return typeof name === 'string' ? name.toUpperCase() : name;
}

function assertSectionNameFree(name, semesterId, exceptId) {
  if (getDb().sections.some((s) => s.semester_id === semesterId && s.name === name && s.id !== exceptId)) {
    const sem = byId(getDb().semesters, semesterId);
    const msg = `Section ${name} already exists in Semester ${sem ? sem.semester_number : ''}.`;
    throw conflict(msg, { name: [msg] });
  }
}

const sectionHandlers = [
  route('get', '/sections/', COLLEGE_ADMIN, (ctx) => {
    const semesterId = ctx.query.get('semester_id');
    const hasCt = parseBoolParam(ctx.query.get('has_class_teacher'));
    const rows = inCollege(getDb().sections, ctx.college.id)
      .filter((s) => !semesterId || s.semester_id === semesterId)
      .filter((s) => hasCt === undefined || Boolean(s.class_teacher_id) === hasCt)
      .map(serializeSection);
    return paginate(ctx, rows, {
      search: [(s) => s.name],
      ordering: {
        name: (s) => s.name,
        created_at: (s) => s.created_at,
        semester_number: (s) => s.semester?.semester_number,
        students_count: (s) => s.students_count,
      },
      defaultSort: sortBy((s) => s.semester?.semester_number, (s) => s.name),
    });
  }),

  route('post', '/sections/', COLLEGE_ADMIN, ({ body, college }) => {
    const db = getDb();
    const v = makeValidator();
    const semesterId = cleanId(v, body, 'semester_id');
    const name = cleanSectionName(v, body, false);
    const ctId = cleanId(v, body, 'class_teacher_id', { required: false, nullable: true });
    let semester = null;
    if (semesterId) {
      semester = getInCollege(db.semesters, semesterId, college.id);
      if (!semester) v.add('semester_id', 'Semester not found.');
    }
    const ct = resolveAssignableFaculty(v, 'class_teacher_id', ctId, college.id);
    v.throwIfAny();
    assertSectionNameFree(name, semester.id);
    if (ct) assertClassTeacherSlotFree(ct.id, semester.id, null, 'class_teacher_id');
    const ts = nowIso();
    const section = {
      id: uid('sections'),
      college_id: college.id,
      semester_id: semester.id,
      name,
      class_teacher_id: ct ? ct.id : null,
      created_at: ts,
      updated_at: ts,
    };
    db.sections.push(section);
    return json(serializeSection(section), 201);
  }),

  route('get', '/sections/:id/', COLLEGE_ADMIN, ({ params, college }) =>
    json(serializeSection(requireFound(getInCollege(getDb().sections, params.id, college.id)))),
  ),

  route('patch', '/sections/:id/', COLLEGE_ADMIN, ({ params, college, body }) => {
    const section = requireFound(getInCollege(getDb().sections, params.id, college.id));
    const v = makeValidator();
    if (present(body, 'semester_id') && body.semester_id !== section.semester_id) {
      v.add('semester_id', 'A section cannot move to another semester.');
    }
    if (present(body, 'class_teacher_id')) {
      v.add('class_teacher_id', 'Use PUT/DELETE /sections/{id}/class-teacher/ to change the class teacher.');
    }
    const name = cleanSectionName(v, body, true);
    v.throwIfAny();
    if (name !== undefined) {
      assertSectionNameFree(name, section.semester_id, section.id);
      section.name = name;
    }
    section.updated_at = nowIso();
    return json(serializeSection(section));
  }),

  route('delete', '/sections/:id/', COLLEGE_ADMIN, ({ params, college }) => {
    const section = requireFound(getInCollege(getDb().sections, params.id, college.id));
    const count = studentsInSection(section.id).length;
    if (count > 0) {
      throw hasDependents(
        `Section ${section.name} still has ${count} student${count === 1 ? '' : 's'}. Move or delete them first.`,
      );
    }
    deleteSection(section.id);
    return empty(204);
  }),

  route('put', '/sections/:id/class-teacher/', COLLEGE_ADMIN, ({ params, college, body }) => {
    const section = requireFound(getInCollege(getDb().sections, params.id, college.id));
    const v = makeValidator();
    const facultyId = cleanId(v, body, 'faculty_id');
    const f = v.has('faculty_id') ? null : resolveAssignableFaculty(v, 'faculty_id', facultyId, college.id);
    v.throwIfAny();
    assertClassTeacherSlotFree(f.id, section.semester_id, section.id, 'faculty_id');
    section.class_teacher_id = f.id;
    section.updated_at = nowIso();
    return json(serializeSection(section));
  }),

  route('delete', '/sections/:id/class-teacher/', COLLEGE_ADMIN, ({ params, college }) => {
    const section = requireFound(getInCollege(getDb().sections, params.id, college.id));
    section.class_teacher_id = null;
    section.updated_at = nowIso();
    return json(serializeSection(section));
  }),
];

// ===========================================================================
// Handlers: semester subjects / offerings (§16)
// ===========================================================================

const semesterSubjectHandlers = [
  route('get', '/semester-subjects/', COLLEGE_ADMIN, (ctx) => {
    const semesterId = ctx.query.get('semester_id');
    const subjectId = ctx.query.get('subject_id');
    const rows = inCollege(getDb().semesterSubjects, ctx.college.id)
      .filter((o) => !semesterId || o.semester_id === semesterId)
      .filter((o) => !subjectId || o.subject_id === subjectId)
      .map(serializeSemesterSubject);
    return paginate(ctx, rows, {
      search: [(o) => o.subject?.code, (o) => o.subject?.name],
      ordering: {
        created_at: (o) => o.created_at,
        semester_number: (o) => o.semester?.semester_number,
        subject_code: (o) => o.subject?.code,
        subject_name: (o) => o.subject?.name,
      },
      defaultSort: sortBy((o) => o.semester?.semester_number, (o) => o.subject?.code),
    });
  }),

  route('post', '/semester-subjects/', COLLEGE_ADMIN, ({ body, college }) => {
    const db = getDb();
    const v = makeValidator();
    const semesterId = cleanId(v, body, 'semester_id');
    const subjectId = cleanId(v, body, 'subject_id');
    const semester = semesterId ? getInCollege(db.semesters, semesterId, college.id) : null;
    const subject = subjectId ? getInCollege(db.subjects, subjectId, college.id) : null;
    if (semesterId && !semester) v.add('semester_id', 'Semester not found.');
    if (subjectId && !subject) v.add('subject_id', 'Subject not found.');
    v.throwIfAny();
    if (db.semesterSubjects.some((o) => o.semester_id === semester.id && o.subject_id === subject.id)) {
      throw conflict(`${subject.code} is already offered in Semester ${semester.semester_number}.`);
    }
    const o = { id: uid('semesterSubjects'), college_id: college.id, semester_id: semester.id, subject_id: subject.id, created_at: nowIso() };
    db.semesterSubjects.push(o);
    return json(serializeSemesterSubject(o), 201);
  }),

  route('get', '/semester-subjects/:id/', COLLEGE_ADMIN, ({ params, college }) =>
    json(serializeSemesterSubject(requireFound(getInCollege(getDb().semesterSubjects, params.id, college.id)))),
  ),

  route('delete', '/semester-subjects/:id/', COLLEGE_ADMIN, ({ params, college }) => {
    deleteSemesterSubject(requireFound(getInCollege(getDb().semesterSubjects, params.id, college.id)).id);
    return empty(204);
  }),
];

// ===========================================================================
// Handlers: section subjects & faculty assignment (§17)
// ===========================================================================

/**
 * Validates and creates one mapping. Throws ApiError on failure.
 * Used by both POST /section-subjects/ and the bulk endpoint.
 */
function createSectionSubject(college, { sectionId, offering, facultyId }) {
  const db = getDb();
  const v = makeValidator();
  const section = sectionId ? getInCollege(db.sections, sectionId, college.id) : null;
  if (sectionId && !section) v.add('section_id', 'Section not found.');
  const f = resolveAssignableFaculty(v, 'faculty_id', facultyId, college.id);
  if (section && offering && section.semester_id !== offering.semester_id) {
    v.add('non_field_errors', 'Section and offering belong to different semesters.');
  }
  v.throwIfAny();
  if (db.sectionSubjects.some((m) => m.section_id === section.id && m.semester_subject_id === offering.id)) {
    throw conflict('Already mapped.');
  }
  const ts = nowIso();
  const m = {
    id: uid('sectionSubjects'),
    college_id: college.id,
    section_id: section.id,
    semester_subject_id: offering.id,
    faculty_id: f ? f.id : null,
    faculty_assigned_at: f ? ts : null,
    created_at: ts,
    updated_at: ts,
  };
  db.sectionSubjects.push(m);
  return m;
}

const sectionSubjectHandlers = [
  route('get', '/section-subjects/', COLLEGE_ADMIN, (ctx) => {
    const q = ctx.query;
    const semesterId = q.get('semester_id');
    const sectionId = q.get('section_id');
    const offeringId = q.get('semester_subject_id');
    const subjectId = q.get('subject_id');
    const facultyId = q.get('faculty_id');
    const unassigned = parseBoolParam(q.get('unassigned'));
    const rows = inCollege(getDb().sectionSubjects, ctx.college.id)
      .filter((m) => !sectionId || m.section_id === sectionId)
      .filter((m) => !offeringId || m.semester_subject_id === offeringId)
      .filter((m) => !facultyId || m.faculty_id === facultyId)
      .filter((m) => unassigned === undefined || !m.faculty_id === unassigned)
      .map(serializeSectionSubject)
      .filter((m) => !semesterId || m.semester?.id === semesterId)
      .filter((m) => !subjectId || m.subject?.id === subjectId);
    return paginate(ctx, rows, {
      search: [(m) => m.subject?.code, (m) => m.subject?.name, (m) => m.section?.name, (m) => m.faculty?.name],
      ordering: {
        created_at: (m) => m.created_at,
        semester_number: (m) => m.semester?.semester_number,
        section_name: (m) => m.section?.name,
        subject_code: (m) => m.subject?.code,
        faculty_name: (m) => m.faculty?.name,
      },
      defaultSort: sortBy((m) => m.semester?.semester_number, (m) => m.section?.name, (m) => m.subject?.code),
    });
  }),

  route('post', '/section-subjects/bulk/', COLLEGE_ADMIN, ({ body, college }) => {
    const db = getDb();
    const v = makeValidator();
    const offeringId = cleanId(v, body, 'semester_subject_id');
    const offering = offeringId ? getInCollege(db.semesterSubjects, offeringId, college.id) : null;
    if (offeringId && !offering) v.add('semester_subject_id', 'Offering not found.');
    if (!Array.isArray(body.items)) v.add('items', 'Expected a list of items.');
    else if (body.items.length === 0) v.add('items', 'This list may not be empty.');
    v.throwIfAny();
    const created = [];
    const failed = [];
    body.items.forEach((item) => {
      const sectionId = item && typeof item === 'object' ? toId(item.section_id) : null;
      try {
        if (!sectionId) throw validationError({ section_id: ['This field is required.'] }, 'section_id is required.');
        const facultyId = toId(item.faculty_id);
        if (Number.isNaN(facultyId)) throw validationError({ faculty_id: ['Incorrect type. Expected pk value.'] });
        const m = createSectionSubject(college, { sectionId, offering, facultyId });
        created.push(serializeSectionSubject(m));
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        const firstDetail = e.details ? Object.values(e.details).flat()[0] : null;
        failed.push({ section_id: sectionId ?? null, code: e.code, message: firstDetail || e.message });
      }
    });
    return json({ created, failed });
  }),

  route('post', '/section-subjects/', COLLEGE_ADMIN, ({ body, college }) => {
    const db = getDb();
    const v = makeValidator();
    const sectionId = cleanId(v, body, 'section_id');
    const offeringId = cleanId(v, body, 'semester_subject_id');
    const facultyId = cleanId(v, body, 'faculty_id', { required: false, nullable: true });
    const offering = offeringId ? getInCollege(db.semesterSubjects, offeringId, college.id) : null;
    if (offeringId && !offering) v.add('semester_subject_id', 'Offering not found.');
    v.throwIfAny();
    const m = createSectionSubject(college, { sectionId, offering, facultyId: facultyId ?? null });
    return json(serializeSectionSubject(m), 201);
  }),

  route('get', '/section-subjects/:id/', COLLEGE_ADMIN, ({ params, college }) =>
    json(serializeSectionSubject(requireFound(getInCollege(getDb().sectionSubjects, params.id, college.id)))),
  ),

  route('patch', '/section-subjects/:id/', COLLEGE_ADMIN, ({ params, college, body }) => {
    const m = requireFound(getInCollege(getDb().sectionSubjects, params.id, college.id));
    const v = makeValidator();
    rejectReadOnly(v, body, ['section_id', 'semester_subject_id']);
    if (present(body, 'faculty_id')) {
      const facultyId = cleanId(v, body, 'faculty_id', { nullable: true });
      const f = facultyId ? resolveAssignableFaculty(v, 'faculty_id', facultyId, college.id) : null;
      v.throwIfAny();
      const ts = nowIso();
      if (f) {
        if (m.faculty_id !== f.id) m.faculty_assigned_at = ts;
        m.faculty_id = f.id;
      } else {
        m.faculty_id = null;
        m.faculty_assigned_at = null;
      }
      m.updated_at = ts;
    }
    v.throwIfAny();
    return json(serializeSectionSubject(m));
  }),

  route('delete', '/section-subjects/:id/', COLLEGE_ADMIN, ({ params, college }) => {
    const m = requireFound(getInCollege(getDb().sectionSubjects, params.id, college.id));
    deleteSectionSubjectsWhere((x) => x.id === m.id);
    return empty(204);
  }),
];

// ===========================================================================
// Fallback: unknown /api/v1 routes → 404 in the standard error shape
// ===========================================================================

const fallbackHandlers = [
  http.all(`${BASE}/*`, async () => {
    await delay(randomLatency());
    return errorResponse(notFound('Endpoint not found.'));
  }),
];

export const handlers = [
  ...systemHandlers,
  ...authHandlers,
  ...meHandlers,
  ...platformHandlers,
  ...collegeHandlers,
  ...facultyHandlers,
  ...studentHandlers,
  ...semesterHandlers,
  ...subjectHandlers,
  ...sectionHandlers,
  ...semesterSubjectHandlers,
  ...sectionSubjectHandlers,
  ...fallbackHandlers,
];
