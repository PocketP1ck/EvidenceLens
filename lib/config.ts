import path from "node:path";

/** Models available to the account, verified via GET /v1/models on 2026-10-24. */
export const MODELS = {
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
} as const;

export type ModelAlias = keyof typeof MODELS;
export type ModelId = (typeof MODELS)[ModelAlias];

export const LIMITS = {
  /** Hard cap on cumulative runtime API spend across all runs (USD). */
  globalCapUsd: Number(process.env.EVIDENCELENS_GLOBAL_CAP_USD ?? 12),
  /** Hard cap per investigation (USD). */
  perRunCapUsd: Number(process.env.EVIDENCELENS_RUN_CAP_USD ?? 1.5),
  /** At this fraction of the per-run cap the agent is forced to finalize. */
  finalizeAtFraction: 0.8,
  maxSteps: 40,
  maxWallClockMs: 15 * 60 * 1000,
  maxOutputTokensPerCall: 4096,
};

export const ROOT = process.cwd();
export const INVESTIGATIONS_DIR = process.env.EVIDENCELENS_INVESTIGATIONS_DIR ?? path.join(ROOT, "investigations");
export const SPEND_FILE = process.env.EVIDENCELENS_SPEND_FILE ?? path.join(ROOT, ".evidencelens", "spend.json");

/** Read the API key on the server only. Never expose through NEXT_PUBLIC_*. */
export function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local.");
  return key;
}

export function resolveModel(alias: string | undefined): ModelId {
  if (alias === "haiku" || alias === MODELS.haiku) return MODELS.haiku;
  return MODELS.sonnet;
}
