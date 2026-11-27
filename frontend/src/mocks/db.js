// In-memory mock database for the PMS Phase 1 API (MSW).
// Persisted to localStorage under `pms-mock-db` so data survives reloads.
// This is FAKE data: passwords are stored in plain text on purpose — mock only.

export const DB_STORAGE_KEY = 'pms-mock-db';
export const SESSION_STORAGE_KEY = 'pms-mock-session';
const DB_VERSION = 2; // v2: integer ids (v1 used UUIDs) — older stored data is re-seeded

// Ids are integers with one sequence per table, like the Django backend's BigAutoField.
const TABLES = ['users', 'colleges', 'faculty', 'students', 'semesters', 'subjects', 'sections', 'semesterSubjects', 'sectionSubjects'];
let sequences = {};

export const uid = (table) => {
  if (!TABLES.includes(table)) throw new Error(`[mock] uid(): unknown table "${table}"`);
  sequences[table] = (sequences[table] || 0) + 1;
  return sequences[table];
};

function syncSequences(data) {
  sequences = Object.fromEntries(TABLES.map((t) => [t, Math.max(0, ...(data[t] || []).map((r) => r.id))]));
}

/**
 * Ids arrive as strings (URL path, query string, X-College-Id header) or numbers (JSON body).
 * Returns the integer id, null when absent, or NaN when malformed (NaN never matches a record).
 */
export const toId = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isInteger(value) && value > 0 ? value : NaN;
  const s = String(value).trim();
  return /^[1-9]\d*$/.test(s) ? Number(s) : NaN;
};

export const nowIso = () => new Date().toISOString();

const daysAgo = (n, hour = 9) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
};

// ---------------------------------------------------------------------------
// Storage helpers (every access wrapped — storage may be unavailable)
// ---------------------------------------------------------------------------

function storageGet(key) {
  try {
    return globalThis.localStorage ? globalThis.localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    if (globalThis.localStorage) globalThis.localStorage.setItem(key, value);
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

function storageRemove(key) {
  try {
    if (globalThis.localStorage) globalThis.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function readSession() {
  return toId(storageGet(SESSION_STORAGE_KEY)) || null; // stored as text; ids are integers
}

export function writeSession(userId) {
  if (userId) storageSet(SESSION_STORAGE_KEY, String(userId));
  else storageRemove(SESSION_STORAGE_KEY);
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

function defaultSettings(collegeId, at) {
  return {
    college_id: collegeId,
    min_team_size: 2,
    max_team_size: 4,
    default_mentor_capacity: 5,
    team_formation_enabled: false,
    teams_locked: false,
    teams_locked_at: null,
    updated_by_id: null,
    updated_at: at,
  };
}

function makeUser({
  email,
  name,
  role,
  collegeId = null,
  status = 'INACTIVE',
  password = null,
  mustChange = true,
  phone = null,
  createdDaysAgo = 30,
  activated = status === 'ACTIVE',
  lastLoginDaysAgo = null,
}) {
  const created = daysAgo(createdDaysAgo);
  return {
    id: uid('users'),
    email: email.trim().toLowerCase(),
    name,
    phone,
    role,
    status,
    password,
    must_change_password: mustChange,
    college_id: collegeId,
    activated_at: activated ? daysAgo(Math.max(createdDaysAgo - 1, 0), 11) : null,
    last_login_at: lastLoginDaysAgo === null ? null : daysAgo(lastLoginDaysAgo, 14),
    created_at: created,
    updated_at: created,
  };
}

export function createSeed() {
  sequences = {};
  const db = {
    version: DB_VERSION,
    users: [],
    colleges: [],
    settings: [],
    faculty: [],
    students: [],
    semesters: [],
    subjects: [],
    sections: [],
    semesterSubjects: [],
    sectionSubjects: [],
    passwordResets: {}, // email -> { otp, expires_at, attempts }
    resetTokens: {}, // token -> { user_id, expires_at }
  };

  // --- Super Admin --------------------------------------------------------
  db.users.push(
    makeUser({
      email: 'superadmin@pms.test',
      name: 'Platform Super Admin',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      password: 'Admin@1234',
      mustChange: false,
      phone: '+919800000001',
      createdDaysAgo: 120,
      lastLoginDaysAgo: 1,
    }),
  );

  // --- Colleges -----------------------------------------------------------
  const sitare = {
    id: uid('colleges'),
    name: 'Sitare University',
    code: 'SITARE',
    status: 'ACTIVE',
    contact_email: 'office@sitare.test',
    contact_phone: '+919811111111',
    address: 'Sitare Campus, Lucknow, Uttar Pradesh',
    created_at: daysAgo(100),
    updated_at: daysAgo(100),
  };
  const demo = {
    id: uid('colleges'),
    name: 'Demo College',
    code: 'DEMO',
    status: 'INACTIVE',
    contact_email: 'contact@demo.test',
    contact_phone: null,
    address: '',
    created_at: daysAgo(60),
    updated_at: daysAgo(20),
  };
  db.colleges.push(sitare, demo);
  db.settings.push(defaultSettings(sitare.id, sitare.created_at), defaultSettings(demo.id, demo.created_at));

  // --- College admin (SITARE only) ----------------------------------------
  const admin = makeUser({
    email: 'admin@sitare.test',
    name: 'Sunita Rao',
    role: 'ADMIN',
    collegeId: sitare.id,
    status: 'ACTIVE',
    password: 'Admin@1234',
    mustChange: false,
    phone: '+919822222222',
    createdDaysAgo: 95,
    lastLoginDaysAgo: 0,
  });
  db.users.push(admin);
  db.settings[0].updated_by_id = admin.id;
  db.settings[0].updated_at = daysAgo(80);

  // --- Faculty ------------------------------------------------------------
  const facultySpecs = [
    { email: 'faculty@sitare.test', name: 'Anil Kumar', status: 'ACTIVE', password: 'Faculty@1234', mustChange: false, lastLogin: 2 },
    { email: 'priya.verma@sitare.test', name: 'Priya Verma', status: 'ACTIVE', password: 'Faculty@1234', mustChange: false, lastLogin: 5 },
    { email: 'rahul.mehta@sitare.test', name: 'Rahul Mehta', status: 'ACTIVE', password: 'Faculty@1234', mustChange: false, lastLogin: 9 },
    { email: 'sneha.iyer@sitare.test', name: 'Sneha Iyer', status: 'ACTIVE', password: 'Faculty@1234', mustChange: true, lastLogin: null },
    { email: 'vikram.singh@sitare.test', name: 'Vikram Singh', status: 'INACTIVE', password: null, mustChange: true, lastLogin: null, activated: false },
    { email: 'neha.gupta@sitare.test', name: 'Neha Gupta', status: 'INACTIVE', password: 'Faculty@1234', mustChange: false, lastLogin: 40, activated: true },
  ];
  const fac = {};
  facultySpecs.forEach((s, i) => {
    const user = makeUser({
      email: s.email,
      name: s.name,
      role: 'FACULTY',
      collegeId: sitare.id,
      status: s.status,
      password: s.password,
      mustChange: s.mustChange,
      phone: `+91990000000${i + 1}`,
      createdDaysAgo: 90 - i * 3,
      activated: s.activated ?? s.status === 'ACTIVE',
      lastLoginDaysAgo: s.lastLogin,
    });
    db.users.push(user);
    const f = { id: uid('faculty'), user_id: user.id, college_id: sitare.id };
    db.faculty.push(f);
    fac[s.name.split(' ')[0].toLowerCase()] = f;
  });

  // --- Semesters ----------------------------------------------------------
  const sem = {};
  [3, 5, 7].forEach((n, i) => {
    const s = { id: uid('semesters'), college_id: sitare.id, semester_number: n, created_at: daysAgo(85 - i), updated_at: daysAgo(85 - i) };
    db.semesters.push(s);
    sem[n] = s;
  });

  // --- Subjects -----------------------------------------------------------
  const sub = {};
  [
    ['DAA', 'Design & Analysis of Algorithms'],
    ['DBMS', 'Database Management Systems'],
    ['OS', 'Operating Systems'],
    ['ML', 'Machine Learning'],
    ['CN', 'Computer Networks'],
    ['SE', 'Software Engineering'],
  ].forEach(([code, name], i) => {
    const s = { id: uid('subjects'), college_id: sitare.id, code, name, created_at: daysAgo(84 - i), updated_at: daysAgo(84 - i) };
    db.subjects.push(s);
    sub[code] = s;
  });

  // --- Sections -----------------------------------------------------------
  const sec = {};
  const mkSection = (semNo, name, ct) => {
    const s = {
      id: uid('sections'),
      college_id: sitare.id,
      semester_id: sem[semNo].id,
      name,
      class_teacher_id: ct ? ct.id : null,
      created_at: daysAgo(80),
      updated_at: daysAgo(80),
    };
    db.sections.push(s);
    sec[`${semNo}${name}`] = s;
  };
  mkSection(7, 'A', fac.anil);
  mkSection(7, 'B', fac.priya);
  mkSection(7, 'C', null);
  mkSection(5, 'A', fac.rahul);
  mkSection(5, 'B', null);

  // --- Offerings ----------------------------------------------------------
  const off = {};
  const mkOffering = (semNo, code) => {
    const o = { id: uid('semesterSubjects'), college_id: sitare.id, semester_id: sem[semNo].id, subject_id: sub[code].id, created_at: daysAgo(78) };
    db.semesterSubjects.push(o);
    off[`${semNo}${code}`] = o;
  };
  mkOffering(7, 'ML');
  mkOffering(7, 'CN');
  mkOffering(7, 'DAA');
  mkOffering(5, 'DBMS');
  mkOffering(5, 'OS');
  mkOffering(5, 'DAA');

  // --- Section mappings ---------------------------------------------------
  const mkMapping = (secKey, offKey, faculty) => {
    db.sectionSubjects.push({
      id: uid('sectionSubjects'),
      college_id: sitare.id,
      section_id: sec[secKey].id,
      semester_subject_id: off[offKey].id,
      faculty_id: faculty ? faculty.id : null,
      faculty_assigned_at: faculty ? daysAgo(70) : null,
      created_at: daysAgo(75),
      updated_at: daysAgo(70),
    });
  };
  mkMapping('7A', '7ML', fac.anil);
  mkMapping('7B', '7ML', fac.sneha);
  mkMapping('7C', '7ML', null);
  mkMapping('7A', '7CN', fac.priya);
  mkMapping('7B', '7CN', null);
  mkMapping('7A', '7DAA', fac.anil);
  mkMapping('5A', '5DBMS', fac.rahul);
  mkMapping('5B', '5DBMS', null);
  mkMapping('5A', '5OS', fac.sneha);
  mkMapping('5B', '5DAA', fac.anil);

  // --- Students -----------------------------------------------------------
  const studentSpecs = [
    // section, name, email, status, password, mustChange
    ['7A', 'Riya Sharma', 'student@sitare.test', 'ACTIVE', 'Student@1234', false, 1],
    ['7A', 'Aarav Patel', 'aarav.patel@sitare.test', 'ACTIVE', 'Student@1234', false, 4],
    ['7A', 'Isha Nair', 'isha.nair@sitare.test', 'INACTIVE', null, true],
    ['7A', 'Kabir Das', 'kabir.das@sitare.test', 'INACTIVE', null, true],
    ['7A', 'Meera Joshi', 'meera.joshi@sitare.test', 'ACTIVE', 'Student@1234', true],
    ['7A', 'Rohan Bose', 'rohan.bose@sitare.test', 'INACTIVE', null, true],
    ['7B', 'Ananya Reddy', 'ananya.reddy@sitare.test', 'ACTIVE', 'Student@1234', false, 3],
    ['7B', 'Dev Malhotra', 'dev.malhotra@sitare.test', 'INACTIVE', null, true],
    ['7B', 'Tanya Kapoor', 'tanya.kapoor@sitare.test', 'INACTIVE', null, true],
    ['7B', 'Yash Agarwal', 'yash.agarwal@sitare.test', 'ACTIVE', 'Student@1234', false, 6],
    ['7B', 'Zoya Khan', 'zoya.khan@sitare.test', 'INACTIVE', null, true],
    ['7C', 'Arjun Menon', 'arjun.menon@sitare.test', 'INACTIVE', null, true],
    ['7C', 'Diya Chawla', 'diya.chawla@sitare.test', 'INACTIVE', null, true],
    ['7C', 'Nikhil Rao', 'nikhil.rao@sitare.test', 'ACTIVE', 'Student@1234', false, 10],
    ['7C', 'Pooja Pillai', 'pooja.pillai@sitare.test', 'INACTIVE', null, true],
    ['5A', 'Aditi Saxena', 'newuser@sitare.test', 'ACTIVE', 'Temp@1234', true],
    ['5A', 'Harsh Vardhan', 'harsh.vardhan@sitare.test', 'ACTIVE', 'Student@1234', false, 2],
    ['5A', 'Kavya Sinha', 'kavya.sinha@sitare.test', 'INACTIVE', null, true],
    ['5A', 'Manav Arora', 'manav.arora@sitare.test', 'INACTIVE', null, true],
    ['5A', 'Sana Mirza', 'sana.mirza@sitare.test', 'INACTIVE', null, true],
    ['5B', 'Aman Tiwari', 'aman.tiwari@sitare.test', 'INACTIVE', null, true],
    ['5B', 'Bhavya Jain', 'bhavya.jain@sitare.test', 'ACTIVE', 'Student@1234', false, 7],
    ['5B', 'Farhan Ali', 'farhan.ali@sitare.test', 'INACTIVE', null, true],
    ['5B', 'Gauri Deshmukh', 'gauri.deshmukh@sitare.test', 'INACTIVE', null, true],
    ['5B', 'Ritika Bansal', 'ritika.bansal@sitare.test', 'INACTIVE', null, true],
  ];
  const rollCounters = { 7: 0, 5: 0 };
  studentSpecs.forEach(([secKey, name, email, status, password, mustChange, lastLogin], i) => {
    const semNo = Number(secKey[0]);
    rollCounters[semNo] += 1;
    const batch = semNo === 7 ? 22 : 23;
    const user = makeUser({
      email,
      name,
      role: 'STUDENT',
      collegeId: sitare.id,
      status,
      password,
      mustChange,
      phone: i % 3 === 0 ? null : `+9197000${String(10000 + i)}`,
      createdDaysAgo: 60 - Math.floor(i / 2),
      lastLoginDaysAgo: lastLogin ?? null,
    });
    db.users.push(user);
    db.students.push({
      id: uid('students'),
      user_id: user.id,
      college_id: sitare.id,
      roll_number: `CSE${batch}${String(rollCounters[semNo]).padStart(3, '0')}`,
      section_id: sec[secKey].id,
    });
  });

  return db;
}

// ---------------------------------------------------------------------------
// Load / save / reset
// ---------------------------------------------------------------------------

function load() {
  const raw = storageGet(DB_STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === DB_VERSION && Array.isArray(parsed.users)) {
        syncSequences(parsed);
        return parsed;
      }
    } catch {
      /* fall through to reseed */
    }
  }
  const seeded = createSeed();
  storageSet(DB_STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

let db = load();

/** Always call getDb() per request — resetDb() replaces the object. */
export function getDb() {
  return db;
}

export function saveDb() {
  storageSet(DB_STORAGE_KEY, JSON.stringify(db));
}

/** Re-seed the mock database and log out. */
export function resetDb() {
  db = createSeed();
  saveDb();
  writeSession(null);
  console.info('[mock] PMS mock DB reset to seed data.');
  return db;
}
