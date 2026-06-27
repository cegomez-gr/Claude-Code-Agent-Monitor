/**
 * @file terminalLinks.ts
 * @description Detects file/document paths in a line of terminal output so they
 * can be turned into clickable links (opened in the in-page document viewer).
 * Matching is anchored to a known code/doc extension to avoid false positives
 * on prose, version numbers (v1.2.3), or hostnames (example.com — those are
 * handled separately by the web-links addon).
 */

export interface FileLinkMatch {
  /** The path portion (no line/col suffix). */
  path: string;
  /** 1-based line number, if the token carried a `:line` suffix. */
  line?: number;
  /** 1-based column, if the token carried a `:line:col` suffix. */
  col?: number;
  /** Inclusive start index within the source string. */
  startIndex: number;
  /** Exclusive end index within the source string (covers any :line:col). */
  endIndex: number;
}

/**
 * Extensions we treat as openable files. Lowercase, without the leading dot.
 * Covers common source, config, and document formats seen in agent output.
 */
export const OPENABLE_EXTENSIONS = new Set([
  // source
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "kts",
  "c",
  "h",
  "cpp",
  "cc",
  "hpp",
  "cs",
  "php",
  "swift",
  "scala",
  "clj",
  "ex",
  "exs",
  "erl",
  "lua",
  "r",
  "dart",
  "vue",
  "svelte",
  "astro",
  // shell / scripts
  "sh",
  "bash",
  "zsh",
  "fish",
  "ps1",
  // config / data
  "json",
  "jsonc",
  "json5",
  "yml",
  "yaml",
  "toml",
  "ini",
  "cfg",
  "conf",
  "env",
  "xml",
  "sql",
  "graphql",
  "gql",
  "proto",
  // web / styles
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  // docs / text
  "md",
  "markdown",
  "mdx",
  "txt",
  "log",
  "rst",
  "csv",
]);

// path (group 1) → ext (group 2), optional :line (3) :col (4).
// Leading optional ~/ ./ ../ then zero+ dir segments then a name.ext token.
const FILE_PATH_RE =
  /((?:~|\.{1,2})?(?:\/[\w.\-]+)+|(?:[\w.\-]+\/)+[\w.\-]+|[\w.\-]+)\.([A-Za-z0-9]+)(?::(\d+)(?::(\d+))?)?/g;

/**
 * Find openable file-path tokens in a single line of text. Returns matches with
 * their character ranges (for mapping to xterm cell coordinates) and parsed
 * line/col. Tokens whose extension is not in {@link OPENABLE_EXTENSIONS} are
 * skipped.
 */
export function findFilePaths(text: string): FileLinkMatch[] {
  const out: FileLinkMatch[] = [];
  // Reset lastIndex defensively (module-level regex is stateful with /g).
  FILE_PATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FILE_PATH_RE.exec(text)) !== null) {
    const [full, base, ext, lineStr, colStr] = m;
    if (!ext || !OPENABLE_EXTENSIONS.has(ext.toLowerCase())) continue;
    const path = `${base}.${ext}`;
    out.push({
      path,
      line: lineStr ? Number(lineStr) : undefined,
      col: colStr ? Number(colStr) : undefined,
      startIndex: m.index,
      endIndex: m.index + full.length,
    });
  }
  return out;
}
