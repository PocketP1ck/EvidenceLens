import fs from "node:fs/promises";
import path from "node:path";
import { MODELS, type ModelId } from "@/lib/config";

/**
 * USD per million tokens, from platform.claude.com pricing (checked 2026-10-24).
 * Cache reads on Sonnet/Opus 5.5 are 0.05x input; Haiku 5.5 is 0.1x (<=100k prompt).
 * 5-minute cache writes are 1.25x input.
 */
export const PRICING: Record<ModelId, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  [MODELS.sonnet]: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  [MODELS.haiku]: { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  usd: number;
  calls: number;
}

export function emptyTotals(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, usd: 0, calls: 0 };
}

/** Cost of one API response. `input_tokens` excludes cached tokens in the Messages API. */
export function costFromUsage(model: ModelId, usage: UsageLike): number {
  const p = PRICING[model];
  if (!p) throw new Error(`No pricing for model ${model}`);
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const usd =
    (usage.input_tokens * p.input + usage.output_tokens * p.output + cacheRead * p.cacheRead + cacheWrite * p.cacheWrite) /
    1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

export function addUsage(totals: UsageTotals, model: ModelId, usage: UsageLike): UsageTotals {
  return {
    inputTokens: totals.inputTokens + usage.input_tokens,
    outputTokens: totals.outputTokens + usage.output_tokens,
    cacheReadTokens: totals.cacheReadTokens + (usage.cache_read_input_tokens ?? 0),
    cacheWriteTokens: totals.cacheWriteTokens + (usage.cache_creation_input_tokens ?? 0),
    usd: Math.round((totals.usd + costFromUsage(model, usage)) * 1e6) / 1e6,
    calls: totals.calls + 1,
  };
}

interface SpendFile {
  totalUsd: number;
  entries: { at: string; runId: string; model: string; usd: number }[];
}

/** Persistent, process-safe-enough global spend ledger for a single-user local app. */
export class SpendLedger {
  constructor(
    private readonly file: string,
    readonly capUsd: number,
  ) {}

  async read(): Promise<SpendFile> {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      const parsed = JSON.parse(raw) as SpendFile;
      return { totalUsd: Number(parsed.totalUsd) || 0, entries: parsed.entries ?? [] };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return { totalUsd: 0, entries: [] };
      throw err;
    }
  }

  async total(): Promise<number> {
    return (await this.read()).totalUsd;
  }

  async remaining(): Promise<number> {
    return Math.max(0, this.capUsd - (await this.total()));
  }

  /** Throws if the global cap is already reached. Call before every model request. */
  async assertCanSpend(): Promise<void> {
    const total = await this.total();
    if (total >= this.capUsd) {
      throw new BudgetExceededError(`Global API budget of $${this.capUsd.toFixed(2)} reached ($${total.toFixed(4)} spent).`);
    }
  }

  async record(runId: string, model: string, usd: number): Promise<number> {
    const data = await this.read();
    data.totalUsd = Math.round((data.totalUsd + usd) * 1e6) / 1e6;
    data.entries.push({ at: new Date().toISOString(), runId, model, usd });
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2));
    await fs.rename(tmp, this.file);
    return data.totalUsd;
  }
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}
