import type { RunEvent, Stage } from "@/lib/harness/types";

export type OtterPose = Stage | "idle" | "stopped";

export interface ActivityState {
  pose: OtterPose;
  stageWord: string;
  label: string;
  previous: string | null;
  findings: { id: string; direction: string; claim: string }[];
  finished: Extract<RunEvent, { type: "finished" }> | null;
}

export const STAGE_WORD: Record<OtterPose, string> = {
  idle: "Ready",
  planning: "Planning",
  searching: "Searching",
  reading: "Reading",
  comparing: "Comparing",
  writing: "Writing",
  finished: "Finished",
  stopped: "Stopped",
};

export function initialActivity(): ActivityState {
  return { pose: "idle", stageWord: STAGE_WORD.idle, label: "Give me a research question to investigate.", previous: null, findings: [], finished: null };
}

/**
 * Pure reducer from harness events to what the UI shows. Pose and label only ever come
 * from the tool currently executing (stage events) or the run's terminal event.
 */
export function reduceActivity(state: ActivityState, e: RunEvent): ActivityState {
  switch (e.type) {
    case "run_started":
      return { ...initialActivity(), pose: "planning", stageWord: STAGE_WORD.planning, label: "Starting the investigation", previous: null };
    case "stage":
      return { ...state, pose: e.stage, stageWord: STAGE_WORD[e.stage], label: e.label, previous: state.label === e.label ? state.previous : state.label };
    case "finding":
      return { ...state, findings: [...state.findings, { id: e.findingId, direction: e.direction, claim: e.claim }] };
    case "finished": {
      const ok = e.status === "completed";
      return {
        ...state,
        pose: ok ? "finished" : "stopped",
        stageWord: ok ? STAGE_WORD.finished : STAGE_WORD.stopped,
        label: ok ? "Research saved to its folder" : e.stopReason,
        previous: state.label,
        finished: e,
      };
    }
    default:
      return state;
  }
}
