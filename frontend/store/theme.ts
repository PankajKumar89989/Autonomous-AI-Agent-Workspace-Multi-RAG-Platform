import { create } from "zustand";

export type Theme = "light" | "dark";

type ThemeState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  init: () => void;
};

export const useThemeStore = create<ThemeState>((set) => ({
  theme: "light",
  setTheme: (theme) => {
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* storage unavailable: theme just won't persist */
    }
    document.documentElement.classList.toggle("dark", theme === "dark");
    set({ theme });
  },
  // The inline script in layout.tsx already applied the class; sync state with it.
  init: () => set({ theme: document.documentElement.classList.contains("dark") ? "dark" : "light" }),
}));
