/**
 * @file useTerminalPrefs.ts
 * @description Runtime preferences for the embedded xterm terminal: color theme
 * (synced with the dashboard theme or fixed), font family, and font size.
 * Persisted in localStorage and exposed through a tiny external store so the
 * Settings controls and the live TerminalPane stay in sync without prop drilling.
 *
 * The default mode is "classic-black" — the terminal's original #0d0d0d look —
 * so existing users see no change until they opt into a different mode.
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import type { ITheme } from "@xterm/xterm";
import { TERMINAL_THEME_CATALOG } from "../lib/terminalThemes";

/**
 * Built-in theme modes. "sync" follows the active dashboard theme; the others
 * are fixed palettes. Beyond these reserved ids, `themeMode` may be any catalog
 * theme id (see ../lib/terminalThemes).
 */
export type ReservedThemeMode = "sync" | "claude-dark" | "claude-light" | "classic-black";

export interface TerminalPrefs {
  /** A reserved mode id or a catalog theme id. */
  themeMode: string;
  /** Font registry id (see TERMINAL_FONTS). */
  fontFamily: string;
  /** Cell font size in px. */
  fontSize: number;
}

/** Catalog id → entry, for O(1) palette lookup. */
const CATALOG_BY_ID = new Map(TERMINAL_THEME_CATALOG.map((e) => [e.id, e]));

export const TERMINAL_PREFS_STORAGE_KEY = "dashboard_terminal_prefs";

export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 20;

const DEFAULT_PREFS: TerminalPrefs = {
  themeMode: "classic-black",
  fontFamily: "system-mono",
  fontSize: 13,
};

export interface TerminalFontMeta {
  id: string;
  label: string;
  /** CSS font-family stack passed to xterm. */
  stack: string;
}

/**
 * Available monospace stacks. "system-mono" mirrors the terminal's original
 * stack. "jetbrains" relies on @fontsource/jetbrains-mono (already bundled in
 * main.tsx); the rest fall back to OS-installed faces with safe generics.
 */
export const TERMINAL_FONTS: TerminalFontMeta[] = [
  {
    id: "system-mono",
    label: "System Mono",
    stack: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
  { id: "jetbrains", label: "JetBrains Mono", stack: "'JetBrains Mono', ui-monospace, monospace" },
  { id: "menlo", label: "Menlo", stack: "Menlo, Monaco, monospace" },
  { id: "consolas", label: "Consolas", stack: "Consolas, 'Courier New', monospace" },
  { id: "courier", label: "Courier", stack: "'Courier New', Courier, monospace" },
];

/** Fixed xterm palettes for the non-synced built-in modes. */
const FIXED_THEMES: Record<Exclude<ReservedThemeMode, "sync">, ITheme> = {
  // Exact original look — preserve existing behavior for users who never opt in.
  "classic-black": { background: "#0d0d0d", foreground: "#e2e8f0" },
  "claude-dark": {
    background: "#1a1815",
    foreground: "#e8e6e3",
    cursor: "#c15f3c",
    cursorAccent: "#1a1815",
    selectionBackground: "rgba(193,95,60,0.3)",
  },
  "claude-light": {
    background: "#faf9f5",
    foreground: "#2c2c2c",
    cursor: "#c15f3c",
    cursorAccent: "#faf9f5",
    selectionBackground: "rgba(193,95,60,0.25)",
  },
};

const RESERVED_MODES = new Set<string>(["sync", "claude-dark", "claude-light", "classic-black"]);

function isThemeMode(v: unknown): v is string {
  return typeof v === "string" && (RESERVED_MODES.has(v) || CATALOG_BY_ID.has(v));
}

function normalize(raw: unknown): TerminalPrefs {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
  const obj = raw as Record<string, unknown>;
  const themeMode = isThemeMode(obj.themeMode) ? obj.themeMode : DEFAULT_PREFS.themeMode;
  const fontFamily =
    typeof obj.fontFamily === "string" && TERMINAL_FONTS.some((f) => f.id === obj.fontFamily)
      ? obj.fontFamily
      : DEFAULT_PREFS.fontFamily;
  const sizeNum = typeof obj.fontSize === "number" ? obj.fontSize : DEFAULT_PREFS.fontSize;
  const fontSize = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(sizeNum)));
  return { themeMode, fontFamily, fontSize };
}

function load(): TerminalPrefs {
  try {
    const stored = localStorage.getItem(TERMINAL_PREFS_STORAGE_KEY);
    if (stored) return normalize(JSON.parse(stored));
  } catch {
    // localStorage/JSON unavailable — fall back to defaults.
  }
  return DEFAULT_PREFS;
}

// Module-level store so Settings controls and the open terminal share one
// reactive source of truth.
let currentPrefs: TerminalPrefs = load();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Read the current prefs synchronously (e.g. at terminal-creation time). */
export function getTerminalPrefs(): TerminalPrefs {
  return currentPrefs;
}

/** Merge a partial update, persist it, and notify subscribers. */
export function setTerminalPrefs(patch: Partial<TerminalPrefs>): void {
  currentPrefs = normalize({ ...currentPrefs, ...patch });
  try {
    localStorage.setItem(TERMINAL_PREFS_STORAGE_KEY, JSON.stringify(currentPrefs));
  } catch {
    // Persistence is best-effort; in-memory state still updates.
  }
  emit();
}

/** Subscribe a component to terminal prefs. */
export function useTerminalPrefs(): TerminalPrefs {
  return useSyncExternalStore(subscribe, getTerminalPrefs, getTerminalPrefs);
}

/**
 * Reactively track the active dashboard theme (the `data-theme` attribute on
 * <html>). Unlike useTheme — whose state is local to each caller — this picks up
 * changes made anywhere (e.g. the ThemeSelector on the same page), which the
 * "sync" terminal mode needs to re-derive its palette live.
 */
export function useDashboardThemeAttr(): string {
  const [attr, setAttr] = useState(
    () => document.documentElement.getAttribute("data-theme") || "claude-light"
  );
  useEffect(() => {
    const read = () =>
      setAttr(document.documentElement.getAttribute("data-theme") || "claude-light");
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    read();
    return () => obs.disconnect();
  }, []);
  return attr;
}

const DEFAULT_FONT_STACK = "ui-monospace, SFMono-Regular, Menlo, monospace";

/** Resolve the CSS font-family stack for a registry id. */
export function resolveFontStack(id: string): string {
  return TERMINAL_FONTS.find((f) => f.id === id)?.stack ?? DEFAULT_FONT_STACK;
}

/** Read a `--token` RGB-channel variable as an `rgb(r,g,b)` string xterm parses. */
function cssVarRgb(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const parts = raw.split(/\s+/).map((n) => Number(n));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return fallback;
  return `rgb(${parts.slice(0, 3).join(",")})`;
}

function cssVarRgba(name: string, alpha: number, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  const parts = raw.split(/\s+/).map((n) => Number(n));
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return fallback;
  return `rgba(${parts.slice(0, 3).join(",")},${alpha})`;
}

/**
 * Build the xterm theme for the given mode. In "sync" mode the palette is
 * derived live from the active dashboard theme's CSS variables, so it reflects
 * the current theme at call time. Note: the ANSI 16-color palette keeps xterm's
 * defaults; a synced *light* terminal may show low-contrast ANSI colors — fixed
 * "claude-light" has the same caveat. This is intentionally out of scope.
 */
export function resolveXtermTheme(mode: string): ITheme {
  if (mode === "sync") {
    return {
      background: cssVarRgb("--surface-1", "#1a1815"),
      foreground: cssVarRgb("--gray-100", "#e8e6e3"),
      cursor: cssVarRgb("--accent", "#c15f3c"),
      cursorAccent: cssVarRgb("--surface-1", "#1a1815"),
      selectionBackground: cssVarRgba("--accent", 0.3, "rgba(193,95,60,0.3)"),
    };
  }
  if (mode in FIXED_THEMES) return FIXED_THEMES[mode as keyof typeof FIXED_THEMES];
  const entry = CATALOG_BY_ID.get(mode);
  return entry ? entry.theme : FIXED_THEMES["classic-black"];
}
