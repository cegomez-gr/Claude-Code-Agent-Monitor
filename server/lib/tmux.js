const { execFile } = require("child_process");

const SAFE_TMUX = /^[a-zA-Z0-9_\-:.]{1,64}$/;

// The dashboard server is often launched from a GUI/mise-managed context whose
// PATH lacks the Homebrew bin dirs where tmux lives, so a bare `tmux` lookup via
// execFile/spawn fails with ENOENT. Append the common locations (without
// shadowing the caller's PATH) so server-side tmux invocations resolve.
const TMUX_PATH_EXTRA = "/opt/homebrew/bin:/usr/local/bin";

function withTmuxPath(env = process.env) {
  const base = env.PATH || "";
  return { ...env, PATH: base ? `${base}:${TMUX_PATH_EXTRA}` : TMUX_PATH_EXTRA };
}

function resolveTmuxSession(tmuxEnv, tmuxPaneEnv) {
  return new Promise((resolve) => {
    if (!tmuxEnv && !tmuxPaneEnv) return resolve(null);
    // $TMUX = "<socket_path>,<pid>,<window>" — pass socket explicitly so this
    // works from the server process, which has no $TMUX in its environment.
    const socketPath = tmuxEnv ? tmuxEnv.split(",")[0] : null;
    const args = socketPath
      ? ["-S", socketPath, "display-message", "-p", "#S"]
      : ["display-message", "-p", "#S"];
    execFile("tmux", args, { timeout: 1000, env: withTmuxPath() }, (err, stdout) => {
      if (err) return resolve(null);
      const name = stdout.trim();
      resolve(SAFE_TMUX.test(name) ? name : null);
    });
  });
}

function hasTmuxSession(name) {
  return new Promise((resolve) => {
    if (!SAFE_TMUX.test(name)) return resolve(false);
    execFile("tmux", ["has-session", "-t", name], { timeout: 1000, env: withTmuxPath() }, (err) =>
      resolve(!err)
    );
  });
}

module.exports = { resolveTmuxSession, hasTmuxSession, SAFE_TMUX, withTmuxPath };
