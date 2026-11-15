import { del, get, patch, post } from "@/lib/api";

// College Admin: project phases per semester-subject
export const listPhases = (params) => get("/phases/", params);
export const createPhase = (body) => post("/phases/", body);
export const updatePhase = (id, body) => patch(`/phases/${id}/`, body);
export const deletePhase = (id) => del(`/phases/${id}/`);
export const bulkDeletePhases = (ids) => post("/phases/bulk-delete/", { ids });
export const lockPhase = (id) => post(`/phases/${id}/lock/`);
export const unlockPhase = (id) => post(`/phases/${id}/unlock/`);
export const reorderPhases = (semesterSubjectId, ids) => post("/phases/reorder/", { semester_subject_id: semesterSubjectId, ids });

// Everything that shows phase data
export const phasesInvalidate = [["phases"], ["teams"], ["evaluations"], ["my"]];
