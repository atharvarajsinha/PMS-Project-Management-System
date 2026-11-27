import { get, post } from "@/lib/api";

// Faculty as mentor: requests and mentored teams
export const listMentoring = (params) => get("/my/mentoring/", params);
export const getMentoring = (id) => get(`/my/mentoring/${id}/`);
export const listMentoringHistory = (params) => get("/my/mentoring/history/", params);
export const acceptMentoring = (id, note) => post(`/my/mentoring/${id}/accept/`, { note });
export const rejectMentoring = (id, note) => post(`/my/mentoring/${id}/reject/`, { note });

// Class teacher: where my section's students stand
export const getClassSectionTeams = (sectionId) => get(`/my/class-sections/${sectionId}/teams/`);
export const getClassStudentProject = (sectionId, studentId) => get(`/my/class-sections/${sectionId}/teams/${studentId}/`);
export const getClassSectionMarks = (sectionId) => get(`/my/class-sections/${sectionId}/marks/`);
