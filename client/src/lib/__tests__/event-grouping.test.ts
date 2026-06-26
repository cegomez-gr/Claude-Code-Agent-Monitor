/**
 * @file event-grouping.test.ts
 * @description Tests groupEvents — the "Group by tool call" view. Verifies it is
 * meaningfully more compact than the flat stream: tool Pre/Post pairs collapse by
 * tool_use_id, and consecutive same-type non-tool events (e.g. TurnDuration
 * floods) collapse into one run row, while a tool call breaks a run.
 * @author Son Nguyen <hoangson091104@gmail.com>
 */
import { describe, it, expect } from "vitest";
import { groupEvents, buildGroupTitle } from "../event-grouping";
import type { DashboardEvent } from "../types";

let nextId = 1;
function ev(
  event_type: string,
  opts: { tool_use_id?: string; tool_name?: string; at?: string } = {}
): DashboardEvent {
  const id = nextId++;
  const data = opts.tool_use_id
    ? JSON.stringify({ tool_use_id: opts.tool_use_id, tool_name: opts.tool_name })
    : JSON.stringify({});
  return {
    id,
    session_id: "s1",
    agent_id: "s1-main",
    event_type,
    tool_name: opts.tool_name ?? null,
    summary: null,
    data,
    created_at: opts.at ?? `2026-06-26T08:00:${String(id).padStart(2, "0")}.000Z`,
  } as DashboardEvent;
}

describe("groupEvents — Group by tool call", () => {
  it("collapses a Pre/Post pair sharing a tool_use_id into one tool group", () => {
    const events = [
      ev("PostToolUse", { tool_use_id: "t1", tool_name: "Bash", at: "2026-06-26T08:00:05.000Z" }),
      ev("PreToolUse", { tool_use_id: "t1", tool_name: "Bash", at: "2026-06-26T08:00:02.000Z" }),
    ];
    const groups = groupEvents(events);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.events).toHaveLength(2);
    expect(groups[0]!.tool_name).toBe("Bash");
    expect(groups[0]!.tool_use_id).toBe("t1");
    expect(groups[0]!.isRun).toBe(false);
    expect(groups[0]!.durationMs).toBe(3000); // 08:00:05 - 08:00:02
  });

  it("collapses consecutive same-type non-tool events into one run", () => {
    const events = [ev("TurnDuration"), ev("TurnDuration"), ev("TurnDuration"), ev("TurnDuration")];
    const groups = groupEvents(events);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.isRun).toBe(true);
    expect(groups[0]!.eventType).toBe("TurnDuration");
    expect(groups[0]!.events).toHaveLength(4);
    expect(buildGroupTitle(groups[0]!)).toBe("TurnDuration ×4");
  });

  it("a tool call breaks an otherwise-consecutive run", () => {
    // Order matters (this is the display order). Tool event splits the run.
    const events = [
      ev("TurnDuration", { at: "2026-06-26T08:00:01.000Z" }),
      ev("TurnDuration", { at: "2026-06-26T08:00:02.000Z" }),
      ev("PreToolUse", { tool_use_id: "tX", tool_name: "Read", at: "2026-06-26T08:00:03.000Z" }),
      ev("TurnDuration", { at: "2026-06-26T08:00:04.000Z" }),
    ];
    const groups = groupEvents(events);
    // 2 separate TurnDuration runs + 1 tool group = 3 groups (NOT one big run).
    expect(groups).toHaveLength(3);
    const runs = groups.filter((g) => g.isRun || g.eventType === "TurnDuration");
    expect(runs.some((g) => g.events.length === 2)).toBe(true); // first run of 2
    expect(groups.some((g) => g.tool_use_id === "tX")).toBe(true);
  });

  it("grouped view is strictly more compact than the flat stream", () => {
    const events = [
      ...Array.from({ length: 20 }, () => ev("TurnDuration")),
      ev("PreToolUse", { tool_use_id: "tA", tool_name: "Bash" }),
      ev("PostToolUse", { tool_use_id: "tA", tool_name: "Bash" }),
      ...Array.from({ length: 15 }, () => ev("TurnDuration")),
    ];
    const groups = groupEvents(events);
    // 37 raw events → 3 rows (run ×20, Bash tool call, run ×15).
    expect(events.length).toBe(37);
    expect(groups.length).toBe(3);
  });

  it("a lone non-tool event stays a single-event group (renders like a flat row)", () => {
    const groups = groupEvents([ev("Notification")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.isRun).toBe(false);
    expect(groups[0]!.events).toHaveLength(1);
    expect(groups[0]!.tool_use_id).toBeNull();
  });
});
