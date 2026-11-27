import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "pms-theme";
const PALETTE_KEY = "pms-palette";
const ThemeContext = createContext(null);

/** Colour palettes; light-mode browser bar colour for each. Dark mode is always black. */
export const PALETTES = {
  blue: { label: "Blue", swatch: "#0D79AB", bar: "#F2FAFF" },
  brown: { label: "Brown", swatch: "#604639", bar: "#FCFCFE" },
};

function readStored(key, fallback, allowed) {
  try {
    const value = localStorage.getItem(key);
    return value && (!allowed || allowed.includes(value)) ? value : fallback;
  } catch {
    return fallback;
  }
}

function store(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: keep in memory only */
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => readStored(STORAGE_KEY, "dark"));
  const [palette, setPaletteState] = useState(() => readStored(PALETTE_KEY, "blue", Object.keys(PALETTES)));

  useEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = theme === "dark" || (theme === "system" && media.matches);
      root.classList.toggle("dark", isDark);
      root.style.colorScheme = isDark ? "dark" : "light";
      if (palette === "blue") delete root.dataset.palette;
      else root.dataset.palette = palette;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", isDark ? "#000000" : PALETTES[palette].bar);
    };
    apply();
    if (theme === "system") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }
  }, [theme, palette]);

  const setTheme = (value) => {
    store(STORAGE_KEY, value);
    setThemeState(value);
  };

  const setPalette = (value) => {
    if (!PALETTES[value]) return;
    store(PALETTE_KEY, value);
    setPaletteState(value);
  };

  return <ThemeContext.Provider value={{ theme, setTheme, palette, setPalette }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
