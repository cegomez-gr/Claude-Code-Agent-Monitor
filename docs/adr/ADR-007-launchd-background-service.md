# ADR-007: Use launchd for macOS Background Service

## Status

Proposed

## Context

The dashboard should not require a visible terminal running npm.

## Decision

On macOS, use a per-user launchd LaunchAgent to run the backend service.

## Consequences

- Service can start at login.
- Browser/dashboard becomes a client.
- Later packaging can add a menu bar app or desktop wrapper.
