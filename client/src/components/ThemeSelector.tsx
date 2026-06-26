/**
 * @file ThemeSelector.tsx
 * @description Theme picker rendered in Settings. Shows a card per theme with
 * representative color swatches and applies the choice immediately via useTheme.
 */

import { Check } from "lucide-react";
import { THEMES, useTheme, type Theme } from "../hooks/useTheme";

interface ThemeSwatchesProps {
  swatches: [string, string, string];
}

function ThemeSwatches({ swatches }: ThemeSwatchesProps) {
  const [bg, surface, accent] = swatches;
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-8 w-8 rounded-md border border-black/10" style={{ backgroundColor: bg }} />
      <span
        className="h-8 w-8 rounded-md border border-black/10"
        style={{ backgroundColor: surface }}
      />
      <span
        className="h-8 w-8 rounded-md border border-black/10"
        style={{ backgroundColor: accent }}
      />
    </div>
  );
}

export function ThemeSelector() {
  const { theme, setTheme } = useTheme();

  return (
    <div role="radiogroup" aria-label="Theme" className="grid gap-3 sm:grid-cols-3">
      {THEMES.map((meta) => {
        const isActive = meta.id === theme;
        return (
          <button
            key={meta.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setTheme(meta.id as Theme)}
            className={`card-hover relative flex flex-col gap-3 p-4 text-left focus:outline-none focus:ring-2 focus:ring-accent/50 ${
              isActive ? "border-accent ring-1 ring-accent/40" : ""
            }`}
          >
            <ThemeSwatches swatches={meta.swatches} />
            <span className="text-sm font-medium text-gray-200">{meta.label}</span>
            {isActive && (
              <span className="absolute right-3 top-3 text-accent">
                <Check size={16} strokeWidth={3} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
