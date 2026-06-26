/**
 * @file useTerminalPrefs.test.ts
 * @description Integrity checks for the generated terminal theme catalog and the
 * theme resolver: every entry exposes a complete palette, ids are unique, and
 * resolveXtermTheme handles built-in modes, catalog ids, and unknown ids.
 */

import { describe, it, expect } from "vitest";
import { resolveXtermTheme } from "../useTerminalPrefs";
import { TERMINAL_THEME_CATALOG } from "../../lib/terminalThemes";

const ANSI_KEYS = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightMagenta",
  "brightCyan",
  "brightWhite",
] as const;

describe("terminal theme catalog", () => {
  it("is non-empty", () => {
    expect(TERMINAL_THEME_CATALOG.length).toBeGreaterThan(50);
  });

  it("has unique ids", () => {
    const ids = TERMINAL_THEME_CATALOG.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has label, group, background, foreground and 16 ANSI colors", () => {
    for (const e of TERMINAL_THEME_CATALOG) {
      expect(e.label, e.id).toBeTruthy();
      expect(e.group, e.id).toBeTruthy();
      expect(e.theme.background, e.id).toMatch(/^#/);
      expect(e.theme.foreground, e.id).toMatch(/^#/);
      for (const k of ANSI_KEYS) {
        expect(e.theme[k], `${e.id}.${k}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

describe("resolveXtermTheme", () => {
  it("returns the exact catalog palette for a known id", () => {
    const dracula = TERMINAL_THEME_CATALOG.find((e) => e.id === "dracula");
    expect(dracula).toBeDefined();
    expect(resolveXtermTheme("dracula")).toEqual(dracula!.theme);
  });

  it("returns the classic-black fixed palette for an unknown id", () => {
    expect(resolveXtermTheme("does-not-exist")).toEqual(resolveXtermTheme("classic-black"));
  });

  it("classic-black preserves the original look", () => {
    expect(resolveXtermTheme("classic-black")).toMatchObject({
      background: "#0d0d0d",
      foreground: "#e2e8f0",
    });
  });

  it("sync yields a palette with a background", () => {
    expect(resolveXtermTheme("sync").background).toBeTruthy();
  });
});
