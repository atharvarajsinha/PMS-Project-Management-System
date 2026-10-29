import { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { setCollegeContext } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const STORAGE_KEY = "pms-managed-college";
const CollegeContext = createContext(null);

function readStored() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

// Super Admin "managing a college" mode: the chosen college is sent as X-College-Id (API.md §1).
export function CollegeProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const [college, setCollegeState] = useState(readStored);

  const managed = isSuperAdmin ? college : null;
  // Set synchronously so the very first college-scoped request carries the header
  setCollegeContext(managed?.id ?? null);

  useEffect(() => {
    if (user && !isSuperAdmin && college) setCollegeState(null);
  }, [user, isSuperAdmin, college]);

  const setCollege = (value) => {
    const next = value ? { id: value.id, name: value.name, code: value.code } : null;
    try {
      if (next) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    setCollegeContext(next?.id ?? null);
    // Drop cached college-scoped data from the previous college
    queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "platform" && q.queryKey[0] !== "me" });
    setCollegeState(next);
  };

  return <CollegeContext.Provider value={{ college: managed, setCollege }}>{children}</CollegeContext.Provider>;
}

export const useCollege = () => useContext(CollegeContext);
