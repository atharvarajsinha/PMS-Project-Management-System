import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "pms-theme";
const ThemeContext = createContext(null);

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "dark";
  } catch {
    return "dark";
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(readStored);

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = theme === "dark" || (theme === "system" && media.matches);
      root.classList.toggle("dark", isDark);
      root.style.colorScheme = isDark ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? "#000000" : "#F2FAFF");
    };
    apply();
    if (theme === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [theme]);

  const setTheme = (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* storage unavailable: keep in memory only */
    }
    setThemeState(value);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
