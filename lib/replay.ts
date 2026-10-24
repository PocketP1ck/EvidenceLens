import type { RunEvent } from "@/lib/harness/types";

/**
 * Delays for replaying a saved run. Original gaps are scaled by `speed` and clamped so that
 * every activity stays readable on screen (min) and long model calls don't stall the video (max).
 */
export function replayDelays(events: RunEvent[], speed = 1, minMs = 650, maxMs = 2600): number[] {
  const s = Math.max(0.25, Math.min(speed, 20));
  return events.map((e, i) => {
    if (i === 0) return 0;
    // Only visible events need screen time; bookkeeping events pass instantly.
    if (e.type === "usage" || e.type === "tool_result") return 0;
    // Measure from the previous *visible* event so model thinking time is preserved proportionally.
    let j = i - 1;
    while (j > 0 && (events[j].type === "usage" || events[j].type === "tool_result")) j--;
    const gap = Date.parse(e.at) - Date.parse(events[j].at);
    return Math.round(Math.min(Math.max(gap / s, minMs), maxMs));
  });
}
