/**
 * @file Tests that TranscriptCache caps the size of each per-entry array
 * (turnDurations / errors / compaction.entries / usageExtras.*) so a long
 * session cannot grow a single cache entry without bound.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const TranscriptCache = require("../lib/transcript-cache");

let tmpDir;
before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tc-bounded-"));
});
after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeJsonl(name, lines) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return p;
}

describe("TranscriptCache._trimArray", () => {
  it("exists and trims arrays to the given max length, keeping the tail", () => {
    const cache = new TranscriptCache();
    assert.equal(typeof cache._trimArray, "function");
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    cache._trimArray(arr, 3);
    assert.deepEqual(arr, [8, 9, 10]);
  });

  it("is a no-op when array is within the cap", () => {
    const cache = new TranscriptCache();
    const arr = [1, 2, 3];
    cache._trimArray(arr, 5);
    assert.deepEqual(arr, [1, 2, 3]);
  });

  it("handles null/undefined safely", () => {
    const cache = new TranscriptCache();
    assert.doesNotThrow(() => cache._trimArray(null, 5));
    assert.doesNotThrow(() => cache._trimArray(undefined, 5));
  });
});