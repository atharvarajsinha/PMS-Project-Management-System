import { get } from "@/lib/api";

// College Admin: counts, pending setup work, per-semester breakdown (one request)
export const getAdminDashboard = () => get("/dashboard/");
