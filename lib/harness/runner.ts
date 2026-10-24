import { INVESTIGATIONS_DIR, LIMITS, SPEND_FILE, type ModelId } from "@/lib/config";
import { getAnthropic } from "./anthropic";
import { SpendLedger } from "./budget";
import { runInvestigation } from "./orchestrator";
import { makeRunId, RunStore } from "./store";
import type { RunMeta } from "./types";

interface ActiveRun {
  id: string;
  controller: AbortController;
  promise: Promise<unknown>;
}

// Survive dev-server module reloads: one registry per process.
const g = globalThis as unknown as { __evidencelensRuns?: Map<string, ActiveRun> };
const active = (g.__evidencelensRuns ??= new Map());

export class RunConflictError extends Error {}

export function activeRunId(): string | null {
  return [...active.keys()][0] ?? null;
}

/**
 * Start one investigation in the background. Only one agent runs at a time:
 * the product is a single independent researcher, and it keeps spend bounded.
 */
export async function startRun(input: { goal: string; context: RunMeta["context"]; model: ModelId }): Promise<string> {
  if (active.size) throw new RunConflictError(`Investigation ${activeRunId()} is still running.`);
  const spend = new SpendLedger(SPEND_FILE, LIMITS.globalCapUsd);
  await spend.assertCanSpend();
  const id = makeRunId(input.goal);
  const store = await RunStore.create(INVESTIGATIONS_DIR, id);
  const controller = new AbortController();
  const promise = runInvestigation({
    runId: id,
    goal: input.goal,
    context: input.context,
    model: input.model,
    client: getAnthropic(),
    spend,
    store,
    signal: controller.signal,
  })
    .catch((err) => console.error(`[evidencelens] run ${id} crashed`, err))
    .finally(() => active.delete(id));
  active.set(id, { id, controller, promise });
  return id;
}

export function stopRun(id: string): boolean {
  const run = active.get(id);
  if (!run) return false;
  run.controller.abort();
  return true;
}
