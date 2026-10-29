import { del, get, patch, post } from "@/lib/api";

const base = "/platform/colleges/";

export const listColleges = (params) => get(base, params);
export const getCollege = (id) => get(`${base}${id}/`);
export const createCollege = (body) => post(base, body);
export const updateCollege = (id, body) => patch(`${base}${id}/`, body);
export const activateCollege = (id) => post(`${base}${id}/activate/`);
export const deactivateCollege = (id) => post(`${base}${id}/deactivate/`);
export const deleteCollege = (id, code) => del(`${base}${id}/`, { confirm: code });

// College Admin (one per college)
export const getCollegeAdmin = (id) => get(`${base}${id}/admin/`);
export const createCollegeAdmin = (id, body) => post(`${base}${id}/admin/`, body);
export const updateCollegeAdmin = (id, body) => patch(`${base}${id}/admin/`, body);
export const deleteCollegeAdmin = (id) => del(`${base}${id}/admin/`);
export const activateCollegeAdmin = (id) => post(`${base}${id}/admin/activate/`);
export const deactivateCollegeAdmin = (id) => post(`${base}${id}/admin/deactivate/`);
export const resendCollegeAdminCredentials = (id) => post(`${base}${id}/admin/resend-credentials/`);
