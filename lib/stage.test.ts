import { describe, expect, it } from "vitest";
import { initialActivity, reduceActivity } from "./stage";
import { replayDelays } from "./replay";
import type { RunEvent } from "@/lib/harness/types";

const at = (s: number) => new Date(Date.UTC(2026, 9, 24, 12, 0, s)).toISOString();

const events: RunEvent[] = [
  { seq: 1, at: at(0), type: "run_started", goal: "g", model: "m" },
  { seq: 2, at: at(3), type: "usage", usd: 0.01, runUsd: 0.01 },
  { seq: 3, at: at(3), type: "stage", stage: "planning", label: "Planning: resolve entities", tool: "update_plan" },
  { seq: 4, at: at(3), type: "tool_result", tool: "update_plan", ok: true, summary: "Plan" },
  { seq: 5, at: at(4), type: "stage", stage: "reading", label: "Retrieving NCT00584740", tool: "get_trial" },
  { seq: 6, at: at(4), type: "finding", findingId: "F1", direction: "opposes", claim: "Futility" },
  { seq: 7, at: at(30), type: "finished", status: "completed", stopReason: "Brief finalized", assessment: "opposed", title: "t" },
];

describe("reduceActivity", () => {
  it("derives pose and label only from tool stage events and the terminal event", () => {
    let s = initialActivity();
    const poses: string[] = [];
    for (const e of events) {
      s = reduceActivity(s, e);
      poses.push(s.pose);
    }
    expect(poses).toEqual(["planning", "planning", "planning", "planning", "reading", "reading", "finished"]);
    expect(s.previous).toBe("Retrieving NCT00584740");
    expect(s.findings).toEqual([{ id: "F1", direction: "opposes", claim: "Futility" }]);
    expect(s.finished?.assessment).toBe("opposed");
  });

  it("shows the stop reason when a run stops early", () => {
    const s = reduceActivity(initialActivity(), { seq: 1, at: at(0), type: "finished", status: "stopped", stopReason: "Per-run budget $1.50 reached" });
    expect(s.pose).toBe("stopped");
    expect(s.label).toMatch(/budget/);
  });
});

describe("replayDelays", () => {
  it("keeps bookkeeping instant, clamps long gaps and scales by speed", () => {
    const d = replayDelays(events, 2);
    expect(d[1]).toBe(0); // usage
    expect(d[3]).toBe(0); // tool_result
    expect(d[2]).toBe(1500); // 3s / 2
    expect(d[4]).toBe(650); // 1s / 2 → clamped to min
    expect(d[6]).toBe(2600); // 26s / 2 → clamped to max
  });
});
