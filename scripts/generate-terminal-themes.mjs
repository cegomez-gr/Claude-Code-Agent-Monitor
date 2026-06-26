#!/usr/bin/env node
/**
 * @file generate-terminal-themes.mjs
 * @description Generates client/src/lib/terminalThemes.ts — the vendored catalog
 * of terminal color schemes offered by https://terminalcolors.com/.
 *
 * terminalcolors.com does not publish its full 16-color ANSI palettes in any
 * cleanly parseable form, so palettes are sourced from the canonical community
 * repo `mbadolato/iTerm2-Color-Schemes` (folder `windowsterminal/`), whose JSON
 * maps 1:1 to xterm's ITheme. Each terminalcolors variant is mapped to its
 * repo filename below. Schemes terminalcolors lists but the repo lacks (mostly
 * Vim/Neovim ports) are recorded in GAPS and printed in the run report.
 *
 * Run: node scripts/generate-terminal-themes.mjs
 * The output file is committed (offline-first); re-run to refresh.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RAW_BASE =
  "https://raw.githubusercontent.com/mbadolato/iTerm2-Color-Schemes/master/windowsterminal";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "client",
  "src",
  "lib",
  "terminalThemes.ts"
);

/**
 * Curated mapping: family → [variantLabel, windowsterminalFilename][].
 * variantLabel "Default" yields a row labeled with the family name.
 */
const FAMILIES = [
  [
    "Ayu",
    [
      ["Dark", "Ayu.json"],
      ["Light", "Ayu Light.json"],
      ["Mirage", "Ayu Mirage.json"],
    ],
  ],
  [
    "Catppuccin",
    [
      ["Frappé", "Catppuccin Frappe.json"],
      ["Latte", "Catppuccin Latte.json"],
      ["Macchiato", "Catppuccin Macchiato.json"],
      ["Mocha", "Catppuccin Mocha.json"],
    ],
  ],
  ["Cobalt2", [["Default", "Cobalt2.json"]]],
  ["Dracula", [["Default", "Dracula.json"]]],
  [
    "Everforest",
    [
      ["Dark", "Everforest Dark Med.json"],
      ["Light", "Everforest Light Med.json"],
    ],
  ],
  [
    "GitHub",
    [
      ["Dark", "GitHub Dark Default.json"],
      ["Dark Dimmed", "GitHub Dark Dimmed.json"],
      ["Dark High Contrast", "GitHub Dark High Contrast.json"],
      ["Dark Colorblind", "GitHub Dark Colorblind.json"],
      ["Light", "GitHub Light Default.json"],
      ["Light High Contrast", "GitHub Light High Contrast.json"],
      ["Light Colorblind", "GitHub Light Colorblind.json"],
    ],
  ],
  [
    "Gruvbox",
    [
      ["Dark", "Gruvbox Dark.json"],
      ["Dark Hard", "Gruvbox Dark Hard.json"],
      ["Light", "Gruvbox Light.json"],
      ["Light Hard", "Gruvbox Light Hard.json"],
    ],
  ],
  [
    "Iceberg",
    [
      ["Dark", "Iceberg Dark.json"],
      ["Light", "Iceberg Light.json"],
    ],
  ],
  ["Jellybeans", [["Default", "Jellybeans.json"]]],
  [
    "Kanagawa",
    [
      ["Wave", "Kanagawa Wave.json"],
      ["Dragon", "Kanagawa Dragon.json"],
      ["Lotus", "Kanagawa Lotus.json"],
    ],
  ],
  ["Miasma", [["Default", "Miasma.json"]]],
  ["Moonfly", [["Default", "Moonfly.json"]]],
  [
    "Night Owl",
    [
      ["Dark", "Night Owl.json"],
      ["Light", "Night Owlish Light.json"],
    ],
  ],
  [
    "Nightfox",
    [
      ["Default", "Nightfox.json"],
      ["Dayfox", "Dayfox.json"],
      ["Dawnfox", "Dawnfox.json"],
      ["Duskfox", "Duskfox.json"],
      ["Nordfox", "Nordfox.json"],
      ["Terafox", "Terafox.json"],
      ["Carbonfox", "Carbonfox.json"],
    ],
  ],
  ["Nord", [["Default", "Nord.json"]]],
  [
    "One",
    [
      ["Dark", "Atom One Dark.json"],
      ["Light", "Atom One Light.json"],
    ],
  ],
  [
    "One Half",
    [
      ["Dark", "One Half Dark.json"],
      ["Light", "One Half Light.json"],
    ],
  ],
  [
    "Rosé Pine",
    [
      ["Default", "Rose Pine.json"],
      ["Moon", "Rose Pine Moon.json"],
      ["Dawn", "Rose Pine Dawn.json"],
    ],
  ],
  ["Shades of Purple", [["Default", "Shades Of Purple.json"]]],
  [
    "Solarized",
    [
      ["Dark", "iTerm2 Solarized Dark.json"],
      ["Light", "iTerm2 Solarized Light.json"],
    ],
  ],
  [
    "Sonokai",
    [
      ["Default", "Sonokai.json"],
      ["Andromeda", "Andromeda.json"],
    ],
  ],
  ["Srcery", [["Default", "Srcery.json"]]],
  [
    "Tokyo Night",
    [
      ["Default", "TokyoNight.json"],
      ["Storm", "TokyoNight Storm.json"],
      ["Moon", "TokyoNight Moon.json"],
      ["Day", "TokyoNight Day.json"],
    ],
  ],
  [
    "Tomorrow",
    [
      ["Default", "Tomorrow.json"],
      ["Night", "Tomorrow Night.json"],
      ["Night Blue", "Tomorrow Night Blue.json"],
      ["Night Bright", "Tomorrow Night Bright.json"],
      ["Night Eighties", "Tomorrow Night Eighties.json"],
    ],
  ],
  [
    "Zenbones",
    [
      ["Zenwritten Dark", "Zenwritten Dark.json"],
      ["Zenwritten Light", "Zenwritten Light.json"],
      ["Neobones Dark", "Neobones Dark.json"],
      ["Neobones Light", "Neobones Light.json"],
      ["Vimbones", "Vimbones.json"],
      ["Duckbones", "Duckbones.json"],
      ["Kanagawabones", "Kanagawabones.json"],
      ["Seoulbones Dark", "Seoulbones Dark.json"],
      ["Seoulbones Light", "Seoulbones Light.json"],
    ],
  ],
];

/**
 * terminalcolors variants the canonical repo does NOT provide (Vim/Neovim ports
 * and a few one-off contrast variants). Documented, not generated.
 */
const GAPS = [
  "Apprentice",
  "Deus",
  "Dracula Soft",
  "Gotham",
  "GitHub Dark Legacy / Light Legacy",
  "Gruvbox Dark Soft / Light Soft",
  "Lucario",
  "Nightfly",
  "Nordic",
  "Noctis (all 11 variants)",
  "Panda",
  "Posterpole (default, gray)",
  "Seoul256 (dark, light)",
  "Shades of Purple Super Dark",
  "Sonokai (Atlantis, Shusia, Maia, Espresso)",
  "Tender",
  "Zenbones: Zenburned, Forestbones, Rosebones, Nordbones, Tokyobones",
];

const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

// windowsterminal key → xterm ITheme key (others map by identity).
const KEY_MAP = { purple: "magenta", brightPurple: "brightMagenta", cursorColor: "cursor" };
const ANSI = [
  "black",
  "red",
  "green",
  "yellow",
  "blue",
  "purple",
  "cyan",
  "white",
  "brightBlack",
  "brightRed",
  "brightGreen",
  "brightYellow",
  "brightBlue",
  "brightPurple",
  "brightCyan",
  "brightWhite",
];

function toTheme(src) {
  const out = {};
  for (const k of ["background", "foreground", "cursorColor", "selectionBackground", ...ANSI]) {
    if (typeof src[k] === "string") out[KEY_MAP[k] ?? k] = src[k];
  }
  return out;
}

async function fetchScheme(file) {
  const url = `${RAW_BASE}/${encodeURIComponent(file)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${file}`);
  return res.json();
}

async function main() {
  const entries = [];
  const failures = [];

  for (const [group, variants] of FAMILIES) {
    for (const [variant, file] of variants) {
      const label = variant === "Default" ? group : `${group} ${variant}`;
      const id = slug(label);
      try {
        const src = await fetchScheme(file);
        entries.push({ id, label, group, theme: toTheme(src) });
        process.stdout.write(".");
      } catch (err) {
        failures.push(`${label} (${file}): ${err.message}`);
        process.stdout.write("x");
      }
    }
  }
  process.stdout.write("\n");

  entries.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));

  const header = `/**
 * @file terminalThemes.ts
 * @description GENERATED — do not edit by hand. Run scripts/generate-terminal-themes.mjs.
 *
 * Vendored catalog of the terminal color schemes from https://terminalcolors.com/.
 * Palettes are sourced from mbadolato/iTerm2-Color-Schemes (windowsterminal/),
 * a community collection under a permissive license; terminalcolors.com is the
 * curation reference for which schemes are included.
 */

import type { ITheme } from "@xterm/xterm";

export interface TerminalThemeEntry {
  /** Stable id stored in prefs. */
  id: string;
  /** Display name. */
  label: string;
  /** Family for grouping in the picker. */
  group: string;
  /** xterm palette. */
  theme: ITheme;
}

export const TERMINAL_THEME_CATALOG: TerminalThemeEntry[] = ${JSON.stringify(entries, null, 2)};
`;

  await writeFile(OUT, header, "utf8");

  console.log(`\nGenerated ${entries.length} themes → ${OUT}`);
  if (failures.length) {
    console.log(`\n${failures.length} fetch failure(s) (re-check mapping):`);
    failures.forEach((f) => console.log("  - " + f));
  }
  console.log(`\nKnown gaps not in canonical source (${GAPS.length}):`);
  GAPS.forEach((g) => console.log("  - " + g));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
