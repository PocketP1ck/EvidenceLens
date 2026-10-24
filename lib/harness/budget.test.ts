import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { addUsage, BudgetExceededError, costFromUsage, emptyTotals, SpendLedger } from "./budget";
import { MODELS } from "@/lib/config";

describe("costFromUsage", () => {
  it("prices Sonnet 5.5 input, output and cache tokens", () => {
    const usd = costFromUsage(MODELS.sonnet, {
      input_tokens: 10_000,
      output_tokens: 2_000,
      cache_read_input_tokens: 40_000,
      cache_creation_input_tokens: 8_000,
    });
    // 10k*2 + 2k*10 + 40k*0.1 + 8k*2.5 = 20000+20000+4000+20000 = 64000 / 1e6
    expect(usd).toBeCloseTo(0.064, 6);
  });

  it("treats missing cache fields as zero", () => {
    expect(costFromUsage(MODELS.haiku, { input_tokens: 1_000_000, output_tokens: 0 })).toBeCloseTo(0.1, 6);
  });

  it("accumulates totals", () => {
    let t = emptyTotals();
    t = addUsage(t, MODELS.sonnet, { input_tokens: 1000, output_tokens: 100 });
    t = addUsage(t, MODELS.sonnet, { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 500 });
    expect(t.calls).toBe(2);
    expect(t.cacheReadTokens).toBe(500);
    expect(t.usd).toBeCloseTo(0.00605, 6);
  });
});

describe("SpendLedger", () => {
  it("records spend and refuses once the cap is reached", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "el-spend-"));
    const ledger = new SpendLedger(path.join(dir, "spend.json"), 0.05);
    await ledger.assertCanSpend();
    await ledger.record("run-a", MODELS.haiku, 0.03);
    await ledger.assertCanSpend();
    await ledger.record("run-a", MODELS.haiku, 0.03);
    expect(await ledger.total()).toBeCloseTo(0.06, 6);
    await expect(ledger.assertCanSpend()).rejects.toBeInstanceOf(BudgetExceededError);
    expect(await ledger.remaining()).toBe(0);
  });
});
