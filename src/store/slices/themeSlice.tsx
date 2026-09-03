// ============================================================
// THEME SLICE — appearance preference: light / system / dark
// Persists to localStorage so the choice survives refresh. "system" means
// follow the OS `prefers-color-scheme`; the light/dark resolution of that
// lives in useResolvedTheme so it can react to the OS changing.
// ============================================================

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export type ThemeMode = "light" | "system" | "dark";

type ThemeState = {
  mode: ThemeMode;
};

const isThemeMode = (v: unknown): v is ThemeMode => v === "light" || v === "system" || v === "dark";

// Read saved preference on startup (gracefully handle SSR/no localStorage).
// New visitors default to "system"; anyone who previously chose light/dark
// keeps that exact value.
const getSavedTheme = (): ThemeMode => {
  try {
    const saved = localStorage.getItem("theme");
    return isThemeMode(saved) ? saved : "system";
  } catch {
    return "system";
  }
};

const themeSlice = createSlice({
  name: "theme",
  initialState: { mode: getSavedTheme() } as ThemeState,
  reducers: {
    setTheme: (state, action: PayloadAction<ThemeMode>) => {
      state.mode = action.payload;
      try {
        localStorage.setItem("theme", state.mode);
      } catch {}
    },
  },
});

export const { setTheme } = themeSlice.actions;
export const selectThemeMode = (state: { theme: ThemeState }) => state.theme.mode;
export default themeSlice.reducer;
