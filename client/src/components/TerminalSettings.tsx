/**
 * @file TerminalSettings.tsx
 * @description Controls for the embedded terminal's appearance (color theme,
 * font family, font size) rendered in the Settings → Appearance section. Writes
 * to the shared terminal-prefs store so an open TerminalPane updates live. A
 * compact preview reflects the current choice (including the synced palette).
 */

import { useTranslation } from "react-i18next";
import { Select, type SelectOption } from "./Select";
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  TERMINAL_FONTS,
  resolveFontStack,
  resolveXtermTheme,
  setTerminalPrefs,
  useDashboardThemeAttr,
  useTerminalPrefs,
  type TerminalThemeMode,
} from "../hooks/useTerminalPrefs";

const FONT_SIZES: number[] = Array.from(
  { length: FONT_SIZE_MAX - FONT_SIZE_MIN + 1 },
  (_, i) => FONT_SIZE_MIN + i
);

export function TerminalSettings() {
  const { t } = useTranslation("settings");
  const prefs = useTerminalPrefs();
  // Subscribe so the preview re-derives when the dashboard theme changes (sync mode).
  useDashboardThemeAttr();

  const modeOptions: SelectOption<TerminalThemeMode>[] = [
    { value: "sync", label: t("appearance.terminal.modeSync", "Sync with dashboard") },
    { value: "classic-black", label: t("appearance.terminal.modeClassic", "Classic black") },
    { value: "claude-dark", label: t("appearance.terminal.modeClaudeDark", "Claude Dark") },
    { value: "claude-light", label: t("appearance.terminal.modeClaudeLight", "Claude Light") },
  ];

  const fontOptions: SelectOption<string>[] = TERMINAL_FONTS.map((f) => ({
    value: f.id,
    label: f.label,
  }));

  const sizeOptions: SelectOption<string>[] = FONT_SIZES.map((s) => ({
    value: String(s),
    label: `${s} px`,
  }));

  const previewTheme = resolveXtermTheme(prefs.themeMode);

  return (
    <div className="card p-4 mt-4">
      <h4 className="text-xs font-medium text-gray-300 mb-1">
        {t("appearance.terminal.title", "Terminal")}
      </h4>
      <p className="text-[11px] text-gray-500 mb-4">
        {t("appearance.terminal.description", "Customize the embedded terminal's appearance.")}
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="block text-[11px] text-gray-400 mb-1.5">
            {t("appearance.terminal.themeMode", "Terminal theme")}
          </span>
          <Select<TerminalThemeMode>
            value={prefs.themeMode}
            onChange={(v) => setTerminalPrefs({ themeMode: v })}
            options={modeOptions}
          />
        </label>

        <label className="block">
          <span className="block text-[11px] text-gray-400 mb-1.5">
            {t("appearance.terminal.font", "Font")}
          </span>
          <Select<string>
            value={prefs.fontFamily}
            onChange={(v) => setTerminalPrefs({ fontFamily: v })}
            options={fontOptions}
          />
        </label>

        <label className="block">
          <span className="block text-[11px] text-gray-400 mb-1.5">
            {t("appearance.terminal.fontSize", "Font size")}
          </span>
          <Select<string>
            value={String(prefs.fontSize)}
            onChange={(v) => setTerminalPrefs({ fontSize: Number(v) })}
            options={sizeOptions}
          />
        </label>
      </div>

      {/* Live preview — mirrors the resolved xterm colors, font, and size. */}
      <div
        className="mt-4 rounded-md border border-border px-3 py-2.5 overflow-hidden"
        style={{
          background: previewTheme.background,
          color: previewTheme.foreground,
          fontFamily: resolveFontStack(prefs.fontFamily),
          fontSize: prefs.fontSize,
          lineHeight: 1.5,
        }}
      >
        <div>
          <span style={{ color: previewTheme.cursor ?? previewTheme.foreground }}>~/project</span>{" "}
          <span style={{ opacity: 0.7 }}>$</span> claude --help
        </div>
        <div style={{ opacity: 0.85 }}>The quick brown fox jumps over 1234567890</div>
      </div>
    </div>
  );
}
