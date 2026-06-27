/**
 * @file Tests for GET /api/sessions/:id/file — the sandboxed file reader behind
 * the terminal's clickable document links. Verifies reads under the session cwd
 * (relative + absolute), markdown classification, and that traversal, missing
 * files, oversize files, and unknown sessions are rejected.
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const os = require("os");
const fs = require("fs");
const http = require("http");

const TEST_DB = path.join(os.tmpdir(), `dashboard-fileviewer-test-${Date.now()}-${process.pid}.db`);
process.env.DASHBOARD_DB_PATH = TEST_DB;

const { createApp, startServer } = require("../index");
const { db } = require("../db");

let server;
let BASE;
let PROJECT;
const SESSION_ID = "sess-fileviewer-1";

function fetch(urlPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: "GET" },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

before(async () => {
  PROJECT = fs.mkdtempSync(path.join(os.tmpdir(), "fileviewer-proj-"));
  fs.mkdirSync(path.join(PROJECT, "src"));
  fs.writeFileSync(path.join(PROJECT, "src", "app.ts"), "export const x = 1;\n");
  fs.writeFileSync(path.join(PROJECT, "README.md"), "# Title\n\nHello\n");
  fs.writeFileSync(path.join(PROJECT, "big.txt"), "a".repeat(2 * 1024 * 1024 + 10));
  // A secret outside the project root, to prove traversal is blocked.
  fs.writeFileSync(path.join(os.tmpdir(), "fileviewer-secret.txt"), "SECRET");

  db.prepare(
    "INSERT INTO sessions (id, name, status, cwd, model, started_at, updated_at, metadata) VALUES (?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?)"
  ).run(SESSION_ID, "Test", "active", PROJECT, "claude-opus-4-8", null);

  const app = createApp();
  server = await startServer(app, 0);
  const addr = server.address();
  BASE = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  server?.close();
  try {
    db.close();
  } catch {
    /* already closed */
  }
});

describe("GET /api/sessions/:id/file", () => {
  it("reads a code file via a relative path", async () => {
    const res = await fetch(`/api/sessions/${SESSION_ID}/file?path=src/app.ts`);
    assert.equal(res.status, 200);
    assert.equal(res.body.kind, "code");
    assert.equal(res.body.ext, ".ts");
    assert.equal(res.body.relPath, path.join("src", "app.ts"));
    assert.match(res.body.content, /export const x = 1;/);
  });

  it("reads a file via an absolute path inside the root", async () => {
    const abs = path.join(PROJECT, "src", "app.ts");
    const res = await fetch(`/api/sessions/${SESSION_ID}/file?path=${encodeURIComponent(abs)}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.content.includes("export const x"), true);
  });

  it("classifies markdown files", async () => {
    const res = await fetch(`/api/sessions/${SESSION_ID}/file?path=README.md`);
    assert.equal(res.status, 200);
    assert.equal(res.body.kind, "markdown");
  });

  it("rejects traversal outside the session root", async () => {
    const res = await fetch(
      `/api/sessions/${SESSION_ID}/file?path=${encodeURIComponent("../fileviewer-secret.txt")}`
    );
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "OUT_OF_ROOT");
  });

  it("rejects an absolute path outside the root", async () => {
    const abs = path.join(os.tmpdir(), "fileviewer-secret.txt");
    const res = await fetch(`/api/sessions/${SESSION_ID}/file?path=${encodeURIComponent(abs)}`);
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, "OUT_OF_ROOT");
  });

  it("404s a missing file", async () => {
    const res = await fetch(`/api/sessions/${SESSION_ID}/file?path=nope.ts`);
    assert.equal(res.status, 404);
  });

  it("rejects files over the size cap", async () => {
    const res = await fetch(`/api/sessions/${SESSION_ID}/file?path=big.txt`);
    assert.equal(res.status, 413);
    assert.equal(res.body.error.code, "TOO_LARGE");
  });

  it("requires a path", async () => {
    const res = await fetch(`/api/sessions/${SESSION_ID}/file`);
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, "BAD_PATH");
  });

  it("404s an unknown session", async () => {
    const res = await fetch(`/api/sessions/does-not-exist/file?path=README.md`);
    assert.equal(res.status, 404);
  });
});
