import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { loadCsrf, setCollegeContext } from "@/lib/api";
import * as authApi from "@/features/auth/api";

const AuthContext = createContext(null);

export const HOME_BY_ROLE = {
  SUPER_ADMIN: "/sa",
  ADMIN: "/admin",
  FACULTY: "/faculty",
  STUDENT: "/student",
};

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready

  // App start → GET /auth/csrf/ → GET /me/ (API.md §2 Session flow)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadCsrf();
        const me = await authApi.getMe();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setStatus("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setCollegeContext(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    window.addEventListener("pms:logout", clearSession);
    return () => window.removeEventListener("pms:logout", clearSession);
  }, [clearSession]);

  useEffect(() => {
    const onPasswordRequired = () => setUser((u) => (u ? { ...u, must_change_password: true } : u));
    window.addEventListener("pms:password-change-required", onPasswordRequired);
    return () => window.removeEventListener("pms:password-change-required", onPasswordRequired);
  }, []);

  const login = async (credentials) => {
    const { user: me } = await authApi.login(credentials);
    queryClient.clear();
    setUser(me);
    return me;
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } finally {
      clearSession();
    }
  };

  return (
    <AuthContext.Provider value={{ user, setUser, status, login, logout }}>{children}</AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
