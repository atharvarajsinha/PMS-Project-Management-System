import { get, patch, post } from "@/lib/api";

export const getMe = () => get("/me/");
export const updateMe = (body) => patch("/me/", body);

export const login = (body) => post("/auth/login/", body);
export const logout = () => post("/auth/logout/");
export const changePassword = (body) => post("/auth/change-password/", body);

export const requestPasswordReset = (body) => post("/auth/password-reset/request/", body);
export const verifyPasswordReset = (body) => post("/auth/password-reset/verify/", body);
export const confirmPasswordReset = (body) => post("/auth/password-reset/confirm/", body);
