import { del, get, patch, post } from "@/lib/api";

export const listSemesters = (params) => get("/semesters/", params);
export const createSemester = (body) => post("/semesters/", body);
export const updateSemester = (id, body) => patch(`/semesters/${id}/`, body);
export const deleteSemester = (id) => del(`/semesters/${id}/`);
export const bulkDeleteSemesters = (ids) => post("/semesters/bulk-delete/", { ids });
