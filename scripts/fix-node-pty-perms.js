#!/usr/bin/env node

/**
 * Ensure node-pty's `spawn-helper` is executable.
 *
 * node-pty forks a PTY on macOS/Linux by exec'ing a small prebuilt
 * `spawn-helper` binary that ships inside the package. Some package managers
 * and archive-extraction paths drop the execute bit when unpacking the
 * prebuilds, which makes every `pty.spawn(...)` fail at runtime with the
 * opaque error "posix_spawnp failed" — and the dashboard's embedded Terminal
 * tab silently connects to nothing.
 *
 * This runs as a postinstall step. It is intentionally fail-safe: it never
 * throws and always exits 0, so a missing node-pty (e.g. on a server-less
 * install) or a Windows host (no spawn-helper) can't break `npm install`.
 */

const fs = require("fs");
const path = require("path");

function makeExecutable(file) {
  try {
    if (!fs.existsSync(file)) return false;
    // 0o755: rwx for owner, rx for group/other — matches node-pty's own default.
    fs.chmodSync(file, 0o755);
    return true;
  } catch {
    return false;
  }
}

try {
  const ptyRoot = path.join(__dirname, "..", "node_modules", "node-pty");
  if (!fs.existsSync(ptyRoot)) process.exit(0);

  const candidates = [];

  // Prebuildify layout (node-pty >= 1.x): prebuilds/<platform-arch>/spawn-helper
  const prebuilds = path.join(ptyRoot, "prebuilds");
  if (fs.existsSync(prebuilds)) {
    for (const dir of fs.readdirSync(prebuilds)) {
      candidates.push(path.join(prebuilds, dir, "spawn-helper"));
    }
  }

  // node-gyp build layout (compiled from source): build/Release/spawn-helper
  candidates.push(path.join(ptyRoot, "build", "Release", "spawn-helper"));

  let fixed = 0;
  for (const file of candidates) {
    if (makeExecutable(file)) fixed += 1;
  }

  if (fixed > 0) {
    console.log(`[setup] Restored execute bit on ${fixed} node-pty spawn-helper binary(ies).`);
  }
} catch {
  // Never block install on this best-effort fixup.
}

process.exit(0);
