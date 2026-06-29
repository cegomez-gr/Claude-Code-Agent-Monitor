import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

const SUMMARY = {
  sessionId: "runtime-1",
  command: "claude",
  persistence: "persistent",
  status: "running",
  capabilities: { attach: true, resize: true, write: true, terminate: false, persistent: true },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
} as const;

function okJson(data: unknown) {
  return { ok: true, json: async () => data };
}

describe("runtimeSessions API contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates sessions from persistence intent without provider selection", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ item: SUMMARY }));
    vi.stubGlobal("fetch", fetchMock);

    await api.runtimeSessions.create({
      title: "Persistent session",
      cwd: "/tmp/project",
      persistence: "persistent",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/runtime-sessions");
    expect(options.method).toBe("POST");

    const body = JSON.parse(String(options.body));
    expect(body).toEqual({
      title: "Persistent session",
      cwd: "/tmp/project",
      persistence: "persistent",
    });
    expect(body).not.toHaveProperty("provider");
  });

  it("lists runtime sessions with optional filters", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ items: [SUMMARY], total: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.runtimeSessions.list({ status: "running", limit: 10 });

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/runtime-sessions?status=running&limit=10");
    expect(result.items).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("gets a single runtime session by id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ item: SUMMARY }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.runtimeSessions.get("runtime-1");

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/runtime-sessions/runtime-1");
    expect(options?.method).toBeUndefined();
    expect(result.item.sessionId).toBe("runtime-1");
  });

  it("terminates a runtime session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.runtimeSessions.terminate("runtime-1");

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/runtime-sessions/runtime-1");
    expect(options.method).toBe("DELETE");
    expect(result.ok).toBe(true);
  });

  it("builds terminal URL without making a request", () => {
    const url = api.runtimeSessions.terminalUrl("runtime-1");
    expect(url).toBe("/api/runtime-sessions/runtime-1/terminal");
  });
});
