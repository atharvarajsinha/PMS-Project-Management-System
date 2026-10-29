import { del, get, patch, post, put } from "@/lib/api";

export const listSections = (params) => get("/sections/", params);
export const createSection = (body) => post("/sections/", body);
export const updateSection = (id, body) => patch(`/sections/${id}/`, body);
export const deleteSection = (id) => del(`/sections/${id}/`);
export const setClassTeacher = (id, facultyId) => put(`/sections/${id}/class-teacher/`, { faculty_id: facultyId });
export const clearClassTeacher = (id) => del(`/sections/${id}/class-teacher/`);
export const bulkDeleteSections = (ids) => post("/sections/bulk-delete/", { ids });
