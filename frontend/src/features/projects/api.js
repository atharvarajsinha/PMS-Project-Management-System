import { del, get, post, put } from "@/lib/api";

// Student portal: my subjects, teams, invites, mentor, submissions (never marks)
export const getMyProjects = () => get("/my/projects/");
export const createMyTeam = (semesterSubjectId) => post("/my/teams/", { semester_subject_id: semesterSubjectId });
export const disbandMyTeam = (id) => del(`/my/teams/${id}/`);
export const listEligibleStudents = (id, params) => get(`/my/teams/${id}/eligible-students/`, params);
export const inviteStudent = (id, studentId) => post(`/my/teams/${id}/invite/`, { student_id: studentId });
export const cancelInvite = (id, inviteId) => post(`/my/teams/${id}/cancel-invite/`, { invite_id: inviteId });
export const removeMyTeamMember = (id, studentId) => post(`/my/teams/${id}/remove-member/`, { student_id: studentId });
export const leaveMyTeam = (id) => post(`/my/teams/${id}/leave/`);
export const makeLead = (id, studentId) => post(`/my/teams/${id}/change-lead/`, { student_id: studentId });
export const listTeamMentors = (id) => get(`/my/teams/${id}/mentors/`);
export const listInviteHistory = (id) => get(`/my/teams/${id}/invite-history/`);
export const listMentorRequests = (id) => get(`/my/teams/${id}/mentor-requests/`);
export const requestMentor = (id, facultyId) => post(`/my/teams/${id}/request-mentor/`, { faculty_id: facultyId });
export const cancelMentorRequest = (id) => post(`/my/teams/${id}/cancel-mentor-request/`);
export const saveSubmission = (id, phaseId, body) => put(`/my/teams/${id}/phases/${phaseId}/submission/`, body);
export const acceptInvite = (inviteId) => post(`/my/invites/${inviteId}/accept/`);
export const declineInvite = (inviteId) => post(`/my/invites/${inviteId}/decline/`);

export const projectsKey = ["my", "projects"];
