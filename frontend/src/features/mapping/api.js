import { del, get, patch, post } from "@/lib/api";

// Semester subjects (offerings)
export const listSemesterSubjects = (params) => get("/semester-subjects/", params);
export const createSemesterSubject = (body) => post("/semester-subjects/", body);
export const deleteSemesterSubject = (id) => del(`/semester-subjects/${id}/`);

// Section subjects & faculty assignment
export const listSectionSubjects = (params) => get("/section-subjects/", params);
export const bulkCreateSectionSubjects = (body) => post("/section-subjects/bulk/", body);
export const assignSectionSubjectFaculty = (id, facultyId) => patch(`/section-subjects/${id}/`, { faculty_id: facultyId });
export const deleteSectionSubject = (id) => del(`/section-subjects/${id}/`);

// Everything a mapping change can affect
export const mappingInvalidate = [["semester-subjects"], ["section-subjects"], ["sections"], ["subjects"], ["semesters"], ["faculty"]];
