import { del, get, patch, post } from "@/lib/api";

// College Admin: who may mentor in a semester, and how many teams each
export const listSemesterMentors = (params) => get("/semester-mentors/", params);
export const addSemesterMentors = (body) => post("/semester-mentors/", body);
export const updateSemesterMentor = (id, body) => patch(`/semester-mentors/${id}/`, body);
export const deleteSemesterMentor = (id) => del(`/semester-mentors/${id}/`);
export const bulkDeleteSemesterMentors = (ids) => post("/semester-mentors/bulk-delete/", { ids });
