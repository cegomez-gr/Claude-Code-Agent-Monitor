# Rollout Plan

## Feature flags

Recommended flags:

- `runtimePlatform.enabled`
- `runtimePlatform.ptyProvider.enabled`
- `runtimePlatform.sessionCreation.enabled`
- `runtimePlatform.persistentCreation.enabled`
- `runtimePlatform.launchd.enabled`

## Rollout order

1. Enable RuntimeManager internally.
2. Use TmuxRuntime for existing attach flow.
3. Enable SessionRegistry.
4. Enable PtyRuntime backend-only.
5. Enable ephemeral session creation for local development.
6. Enable persistent session creation.
7. Enable UI controls.
8. Enable launchd scripts.

## Safety

Do not remove old flow until:

- existing attach flow has tests;
- RuntimeManager attach is proven stable;
- rollback path is documented.
