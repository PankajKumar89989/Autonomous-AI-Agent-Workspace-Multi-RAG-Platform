"use client";

import { Moon, Sun } from "lucide-react";

import { useThemeStore } from "@/store/theme";

export default function ThemeToggle() {
  const { theme, setTheme } = useThemeStore();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      className="rounded-lg p-2 hover:bg-stone-100 dark:hover:bg-stone-800"
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
