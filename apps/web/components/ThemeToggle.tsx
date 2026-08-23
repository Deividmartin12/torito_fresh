"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  function toggleTheme() {
    const nextTheme: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    document.documentElement.style.colorScheme = nextTheme;
    localStorage.setItem("torito-theme", nextTheme);
    setTheme(nextTheme);
  }

  const nextThemeLabel = theme === "light" ? "oscuro" : "claro";

  return (
    <button
      aria-label={`Cambiar a tema ${nextThemeLabel}`}
      className={`theme-toggle ${className}`.trim()}
      onClick={toggleTheme}
      title={`Cambiar a tema ${nextThemeLabel}`}
      type="button"
    >
      {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
      <span>{theme === "light" ? "Oscuro" : "Claro"}</span>
    </button>
  );
}
