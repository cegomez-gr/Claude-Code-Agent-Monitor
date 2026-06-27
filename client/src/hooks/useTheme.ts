/**
 * @file useTheme.ts
 * @description Runtime theme state. Persists the selected theme in localStorage
 * and applies it via the `data-theme` attribute on <html>. The same key and
 * default are mirrored by the anti-FOUC script in index.html.
 */

import { useCallback, useState } from "react";

export type Theme = "claude-light" | "claude-dark" | "midnight";

export const THEME_STORAGE_KEY = "dashboard_theme";

const DEFAULT_THEME: Theme = "claude-light";

export interface ThemeMeta {
  id: Theme;
  /** Short display name (theme names are proper nouns — not translated). */
  label: string;
  /** Representative swatches [background, surface, accent] for the picker. */
  swatches: [string, string, string];
}

export const THEMES: ThemeMeta[] = [
  {
    id: "claude-light",
    label: "Claude Light",
    swatches: ["#faf9f5", "#ffffff", "#c15f3c"],
  },
  {
    id: "claude-dark",
    label: "Claude Dark",
    swatches: ["#1a1815", "#2a251d", "#c15f3c"],
  },
  {
    id: "midnight",
    label: "Midnight",
    swatches: ["#06060a", "#1a1a28", "#6366f1"],
  },
];

const VALID_THEMES = new Set<string>(THEMES.map((t) => t.id));

function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && VALID_THEMES.has(value);
}

/** Read the persisted theme, falling back to the default when unset/invalid. */
export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // localStorage unavailable (private mode, etc.) — use the default.
  }
  return DEFAULT_THEME;
}

function applyTheme(theme: Theme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Theme hook. Returns the active theme and a setter that persists the choice
 * and applies it immediately. Initial state is read from the attribute already
 * set by the anti-FOUC script (falling back to localStorage/default).
 */
export function useTheme(): { theme: Theme; setTheme: (theme: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    return isTheme(attr) ? attr : loadTheme();
  });

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Persistence is best-effort; the in-memory state still updates.
    }
  }, []);

  return { theme, setTheme };
}
