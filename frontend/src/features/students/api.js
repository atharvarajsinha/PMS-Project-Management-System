import { del, get, patch, post } from "@/lib/api";

export const listStudents = (params) => get("/students/", params);
export const getStudent = (id) => get(`/students/${id}/`);
export const createStudent = (body) => post("/students/", body);
export const updateStudent = (id, body) => patch(`/students/${id}/`, body);
export const deleteStudent = (id) => del(`/students/${id}/`);
export const activateStudent = (id) => post(`/students/${id}/activate/`);
export const deactivateStudent = (id) => post(`/students/${id}/deactivate/`);
export const resendStudentCredentials = (id) => post(`/students/${id}/resend-credentials/`);
// body: exactly one of { ids } | { section_id } | { semester_id }
export const bulkActivateStudents = (body) => post("/students/bulk-activate/", body);
export const bulkDeactivateStudents = (body) => post("/students/bulk-deactivate/", body);
export const bulkDeleteStudents = (ids) => post("/students/bulk-delete/", { ids });
