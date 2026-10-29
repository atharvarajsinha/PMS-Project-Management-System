import { del, get, patch, post } from "@/lib/api";

export const listSubjects = (params) => get("/subjects/", params);
export const createSubject = (body) => post("/subjects/", body);
export const updateSubject = (id, body) => patch(`/subjects/${id}/`, body);
export const deleteSubject = (id) => del(`/subjects/${id}/`);
export const bulkDeleteSubjects = (ids) => post("/subjects/bulk-delete/", { ids });
