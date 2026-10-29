import { get, patch } from "@/lib/api";

export const getCurrentCollege = () => get("/college/");
export const getSettings = () => get("/settings/");
export const updateSettings = (body) => patch("/settings/", body);
