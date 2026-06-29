const { withTmuxPath } = require("./tmux");

function spawnTmuxAttach({ nodePty, session, tmuxSession }) {
  return nodePty.spawn("tmux", ["attach-session", "-t", tmuxSession], {
    name: "xterm-256color",
    cols: 220,
    rows: 50,
    cwd: session.cwd || process.env.HOME,
    env: withTmuxPath({ ...process.env, TERM: "xterm-256color" }),
  });
}

module.exports = { spawnTmuxAttach };
