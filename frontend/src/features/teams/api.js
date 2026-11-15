import { del, get, patch, post } from "@/lib/api";

// College Admin: every team, locked or not
export const listTeams = (params) => get("/teams/", params);
export const getTeam = (id) => get(`/teams/${id}/`);
export const createTeam = (body) => post("/teams/", body);
export const renameTeam = (id, name) => patch(`/teams/${id}/`, { name });
export const deleteTeam = (id) => del(`/teams/${id}/`);
export const bulkDeleteTeams = (ids) => post("/teams/bulk-delete/", { ids });
export const addTeamMember = (id, studentId) => post(`/teams/${id}/add-member/`, { student_id: studentId });
export const removeTeamMember = (id, studentId) => post(`/teams/${id}/remove-member/`, { student_id: studentId });
export const changeTeamLead = (id, studentId) => post(`/teams/${id}/change-lead/`, { student_id: studentId });
export const assignMentor = (id, body) => post(`/teams/${id}/assign-mentor/`, body);
export const removeMentor = (id, assignmentId) => post(`/teams/${id}/remove-mentor/`, { assignment_id: assignmentId });
export const setEvaluator = (id, body) => post(`/teams/${id}/set-evaluator/`, body);
export const listUnassignedStudents = (params) => get("/teams/unassigned-students/", params);

export const teamsInvalidate = [["teams"], ["semester-mentors"], ["evaluations"], ["phases"]];
