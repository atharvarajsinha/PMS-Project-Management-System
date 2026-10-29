import { del, get, patch, post } from "@/lib/api";

export const listFaculty = (params) => get("/faculty/", params);
export const getFaculty = (id) => get(`/faculty/${id}/`);
export const createFaculty = (body) => post("/faculty/", body);
export const updateFaculty = (id, body) => patch(`/faculty/${id}/`, body);
export const deleteFaculty = (id) => del(`/faculty/${id}/`);
export const activateFaculty = (id) => post(`/faculty/${id}/activate/`);
export const deactivateFaculty = (id) => post(`/faculty/${id}/deactivate/`);
export const resendFacultyCredentials = (id) => post(`/faculty/${id}/resend-credentials/`);
export const bulkActivateFaculty = (ids) => post("/faculty/bulk-activate/", { ids });
export const bulkDeactivateFaculty = (ids) => post("/faculty/bulk-deactivate/", { ids });
export const bulkDeleteFaculty = (ids) => post("/faculty/bulk-delete/", { ids });
