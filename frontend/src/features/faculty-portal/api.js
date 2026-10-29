import { get, patch, post } from "@/lib/api";

// Faculty portal (/my/...): the logged-in faculty member's own data (API.md "Faculty portal")
export const getFacultyDashboard = () => get("/my/dashboard/");

// Sections where I am the class teacher
export const listClassSections = (params) => get("/my/class-sections/", params);
export const getClassSection = (id) => get(`/my/class-sections/${id}/`);

// Students of one of my class sections (no delete, section is fixed)
const studentsBase = (sectionId) => `/my/class-sections/${sectionId}/students/`;
export const listClassStudents = (sectionId, params) => get(studentsBase(sectionId), params);
export const createClassStudent = (sectionId, body) => post(studentsBase(sectionId), body);
export const updateClassStudent = (sectionId, id, body) => patch(`${studentsBase(sectionId)}${id}/`, body);
export const activateClassStudent = (sectionId, id) => post(`${studentsBase(sectionId)}${id}/activate/`);
export const deactivateClassStudent = (sectionId, id) => post(`${studentsBase(sectionId)}${id}/deactivate/`);
export const resendClassStudentCredentials = (sectionId, id) => post(`${studentsBase(sectionId)}${id}/resend-credentials/`);
export const bulkActivateClassStudents = (sectionId, ids) => post(`${studentsBase(sectionId)}bulk-activate/`, { ids });
export const bulkDeactivateClassStudents = (sectionId, ids) => post(`${studentsBase(sectionId)}bulk-deactivate/`, { ids });

// My section-subject teaching assignments (read-only)
export const listTeaching = (params) => get("/my/teaching/", params);
export const getTeaching = (id) => get(`/my/teaching/${id}/`);
export const listTeachingStudents = (id, params) => get(`/my/teaching/${id}/students/`, params);
