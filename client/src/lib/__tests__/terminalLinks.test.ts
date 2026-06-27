/**
 * @file terminalLinks.test.ts
 * @description Unit tests for file-path detection in terminal output.
 */

import { describe, it, expect } from "vitest";
import { findFilePaths } from "../terminalLinks";

describe("findFilePaths", () => {
  it("detects an absolute path with line and column", () => {
    const m = findFilePaths("  at /Users/me/proj/src/app.ts:12:3")[0]!;
    expect(m).toMatchObject({ path: "/Users/me/proj/src/app.ts", line: 12, col: 3 });
  });

  it("detects a relative path", () => {
    const m = findFilePaths("edited src/components/Foo.tsx")[0]!;
    expect(m.path).toBe("src/components/Foo.tsx");
    expect(m.line).toBeUndefined();
  });

  it("detects a bare filename with a line suffix", () => {
    const m = findFilePaths("see README.md:5 for details")[0]!;
    expect(m).toMatchObject({ path: "README.md", line: 5 });
  });

  it("reports correct character ranges", () => {
    const text = "open foo.py now";
    const m = findFilePaths(text)[0]!;
    expect(text.slice(m.startIndex, m.endIndex)).toBe("foo.py");
  });

  it("ignores version numbers and hostnames", () => {
    expect(findFilePaths("bumped to v1.2.3 today")).toHaveLength(0);
    expect(findFilePaths("visit example.com for more")).toHaveLength(0);
  });

  it("finds multiple paths in one line", () => {
    const matches = findFilePaths("moved a/b.ts -> c/d.ts");
    expect(matches.map((m) => m.path)).toEqual(["a/b.ts", "c/d.ts"]);
  });

  it("returns empty for plain prose", () => {
    expect(findFilePaths("the quick brown fox")).toHaveLength(0);
  });
});
