"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // usual next-themes fix for hydration mismatch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-8 w-14" />;

  const isDark = resolvedTheme === "dark";
  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle dark mode"
      className="h-8 w-14 rounded-full border border-border bg-surface px-1 flex items-center transition-colors cursor-pointer"
    >
      <span
        className={`h-6 w-6 rounded-full bg-accent transition-transform flex items-center justify-center text-xs ${
          isDark ? "translate-x-6" : "translate-x-0"
        }`}
      >
        {isDark ? "🌙" : "☀"}
      </span>
    </button>
  );
}
