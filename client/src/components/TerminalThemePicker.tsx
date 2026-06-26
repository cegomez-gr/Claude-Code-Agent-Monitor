/**
 * @file TerminalThemePicker.tsx
 * @description Searchable, grouped picker for the terminal color theme. The flat
 * Select dropdown doesn't scale to ~75 themes, so this adds a live filter and
 * family grouping, plus a per-row palette swatch for visual scanning. Models its
 * open/close, keyboard, and flip-up behavior on Select.tsx; selecting writes the
 * theme id to prefs. Built-in modes (sync + fixed) are listed first.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ITheme } from "@xterm/xterm";
import { TERMINAL_THEME_CATALOG } from "../lib/terminalThemes";
import { resolveXtermTheme } from "../hooks/useTerminalPrefs";

interface ThemeOption {
  id: string;
  label: string;
  group: string;
  theme: ITheme;
}

/** Small palette preview: background plus four representative ANSI colors. */
function Swatch({ theme }: { theme: ITheme }) {
  const dots = [theme.red, theme.green, theme.blue, theme.yellow];
  return (
    <span
      className="flex h-5 w-5 flex-shrink-0 items-center justify-center gap-px rounded border border-black/20"
      style={{ background: theme.background }}
      aria-hidden="true"
    >
      {dots.map((c, i) => (
        <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      ))}
    </span>
  );
}

export function TerminalThemePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [openUp, setOpenUp] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const builtinGroup = t("appearance.terminal.groupBuiltin", "Built-in");
  const builtins: ThemeOption[] = useMemo(
    () =>
      [
        { id: "sync", label: t("appearance.terminal.modeSync", "Sync with dashboard") },
        { id: "classic-black", label: t("appearance.terminal.modeClassic", "Classic black") },
        { id: "claude-dark", label: t("appearance.terminal.modeClaudeDark", "Claude Dark") },
        { id: "claude-light", label: t("appearance.terminal.modeClaudeLight", "Claude Light") },
      ].map((b) => ({ ...b, group: builtinGroup, theme: resolveXtermTheme(b.id) })),
    [t, builtinGroup]
  );

  const allOptions: ThemeOption[] = useMemo(
    () => [...builtins, ...TERMINAL_THEME_CATALOG],
    [builtins]
  );

  // Filter by label/group/id, then keep group order (built-ins first, then the
  // catalog's A→Z order from the generator).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter(
      (o) =>
        o.label.toLowerCase().includes(q) || o.group.toLowerCase().includes(q) || o.id.includes(q)
    );
  }, [allOptions, query]);

  const current = allOptions.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // On open: focus the search, reset to the current selection, decide flip side.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    const idx = allOptions.findIndex((o) => o.id === value);
    setActive(idx >= 0 ? idx : 0);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setOpenUp(below < 360 && rect.top > below);
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, value, allOptions]);

  // Keep the active row in view.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const choose = (opt: ThemeOption) => {
    onChange(opt.id);
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) choose(opt);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  // After filtering, clamp the active index into range.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  let lastGroup = "";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 bg-surface-2 border border-border rounded-md px-3 py-1.5 text-[11px] text-gray-100 focus:outline-none focus:border-accent/50 hover:bg-surface-3 transition-colors"
      >
        <span className="flex items-center gap-2 truncate">
          {current && <Swatch theme={current.theme} />}
          <span className="truncate">{current?.label ?? "-"}</span>
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
      </button>

      {open && (
        <div
          className={`absolute z-30 left-0 right-0 rounded-md border border-border bg-surface-1 shadow-lg shadow-black/40 ${
            openUp ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          <div className="p-1.5 border-b border-border">
            <div className="flex items-center gap-2 bg-surface-2 rounded px-2">
              <Search className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKey}
                placeholder={t("appearance.terminal.searchPlaceholder", "Search themes…")}
                className="w-full bg-transparent py-1.5 text-[11px] text-gray-100 placeholder-gray-500 focus:outline-none"
              />
            </div>
          </div>
          <div ref={listRef} className="max-h-72 overflow-auto py-1" role="listbox">
            {filtered.length === 0 && (
              <div className="px-3 py-3 text-[11px] text-gray-500">
                {t("appearance.terminal.noResults", "No themes found")}
              </div>
            )}
            {filtered.map((opt, idx) => {
              const isSelected = opt.id === value;
              const isActive = idx === active;
              const showHeader = opt.group !== lastGroup;
              lastGroup = opt.group;
              return (
                <div key={opt.id}>
                  {showHeader && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                      {opt.group}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    data-active={isActive}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => choose(opt)}
                    onMouseEnter={() => setActive(idx)}
                    className={`w-full text-left px-3 py-1.5 flex items-center gap-2 transition-colors ${
                      isActive ? "bg-accent/15" : isSelected ? "bg-surface-3" : "hover:bg-surface-3"
                    }`}
                  >
                    <Swatch theme={opt.theme} />
                    <span
                      className={`text-[11px] flex-1 truncate ${
                        isSelected ? "text-accent font-medium" : "text-gray-200"
                      }`}
                    >
                      {opt.label}
                    </span>
                    {isSelected && <Check className="w-3 h-3 text-accent flex-shrink-0" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
