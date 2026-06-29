const {
  PersistencePolicy,
  RuntimeProviderName,
  RuntimeStatus,
  defineCapabilities,
} = require("./contracts");
const { SessionRegistry } = require("./session-registry");

function tmuxExternalCapabilities() {
  return defineCapabilities({
    attach: true,
    resize: true,
    write: true,
    terminate: false,
    persistent: true,
    externalAttach: true,
    supportsCreate: false,
  });
}

function tmuxExternalRecord(session, tmuxSession) {
  return {
    sessionId: session.id,
    title: session.name || undefined,
    cwd: session.cwd || undefined,
    command: "claude",
    args: [],
    env: {},
    persistence: PersistencePolicy.PERSISTENT,
    provider: RuntimeProviderName.TMUX,
    providerId: tmuxSession,
    status: RuntimeStatus.RUNNING,
    capabilities: tmuxExternalCapabilities(),
    metadata: {
      tmux: {
        sessionName: tmuxSession,
        externallyDiscovered: true,
        dashboardOwned: false,
      },
      claude: {
        hookSessionId: session.id,
        transcriptPath: session.transcript_path || undefined,
      },
    },
  };
}

function mirrorTmuxMetadata({ session, tmuxSession, registry } = {}) {
  if (!session?.id || !tmuxSession) return null;
  const target = registry || new SessionRegistry();
  return target.upsert(tmuxExternalRecord(session, tmuxSession));
}

module.exports = {
  mirrorTmuxMetadata,
  tmuxExternalCapabilities,
  tmuxExternalRecord,
};
