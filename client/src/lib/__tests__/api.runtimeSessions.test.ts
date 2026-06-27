import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";

describe("runtimeSessions API contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates sessions from persistence intent without provider selection", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        item: {
          sessionId: "runtime-1",
          command: "claude",
          persistence: "persistent",
          status: "running",
          capabilities: {
            attach: true,
            resize: true,
            write: true,
            terminate: false,
            persistent: true,
          },
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      }),
    });
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
});
