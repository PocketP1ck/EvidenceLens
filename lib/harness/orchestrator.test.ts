import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { coerceJsonStrings, runInvestigation, type ModelClient } from "./orchestrator";
import { SpendLedger } from "./budget";
import { RunStore } from "./store";
import { MODELS } from "@/lib/config";
import { fixture, mockFetch, resetFetch } from "@/lib/adapters/testing";

afterEach(resetFetch);

type Block = { type: "tool_use"; name: string; input: unknown } | { type: "text"; text: string };

function scripted(turns: Block[][], usage = { input_tokens: 2000, output_tokens: 300 }) {
  const calls: Anthropic.Messages.MessageCreateParamsNonStreaming[] = [];
  let i = 0;
  const client: ModelClient = {
    messages: {
      async create(params) {
        calls.push(structuredClone(params));
        const blocks = turns[Math.min(i++, turns.length - 1)];
        return {
          id: `msg_${i}`,
          type: "message",
          role: "assistant",
          model: params.model,
          content: blocks.map((b, j) => (b.type === "tool_use" ? { ...b, id: `tu_${i}_${j}` } : b)),
          stop_reason: blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
          stop_sequence: null,
          usage: { ...usage, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        } as unknown as Anthropic.Messages.Message;
      },
    },
  };
  return { client, calls };
}

async function tmp() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "el-orch-"));
  return { root, spend: new SpendLedger(path.join(root, "spend.json"), 5) };
}

const tu = (name: string, input: unknown): Block => ({ type: "tool_use", name, input });

const goodBrief = {
  title: "IL-17A blockade in Crohn's disease",
  question: "Does IL-17A inhibition help active Crohn's disease?",
  assessment: "opposed",
  summary: { text: "The randomized secukinumab trial was stopped for futility.", findingIds: ["F1"] },
  keyFindings: [{ text: "Stopped for futility at interim analysis.", findingIds: ["F1"] }],
  opposingEvidence: [{ text: "Futility in the core RCT.", findingIds: ["F1"] }],
  contextDifferences: [],
  limitations: ["Single phase 2 trial."],
  unknowns: [],
  nextQuestions: ["Do IL-23 inhibitors differ?"],
};

describe("coerceJsonStrings", () => {
  it("parses stringified arrays/objects and leaves other strings alone", () => {
    expect(coerceJsonStrings({ terms: '["a","b"]', summary: '{"text":"x"}', claim: "[not json", n: 3 })).toEqual({
      terms: ["a", "b"],
      summary: { text: "x" },
      claim: "[not json",
      n: 3,
    });
    expect(coerceJsonStrings({ terms: "risankizumab, crohn*", claim: "a, b" })).toEqual({ terms: ["risankizumab", "crohn*"], claim: "a, b" });
  });
});

describe("runInvestigation", () => {
  it("runs a full scripted investigation, enforcing citations and the brief contract", async () => {
    mockFetch([
      ["/studies/NCT00584740", fixture("ctgov-NCT00584740.json")],
      ["/studies?", fixture("ctgov-search-secukinumab-crohn.json")],
    ]);
    const { root, spend } = await tmp();
    const store = await RunStore.create(root, "2026-10-24-test-run-0001");
    const { client, calls } = scripted([
      [tu("update_plan", { steps: [{ title: "Find trials", status: "in_progress" }, { title: "Write brief", status: "pending" }] })],
      [tu("get_trial", { nctId: "NCT00584740" }), tu("search_trials", { condition: "Crohn disease", intervention: "secukinumab", intent: "counter" })],
      [tu("record_finding", { claim: "Made-up claim about a trial", direction: "opposes", outcome: "negative", kind: "interpretation", sourceIds: ["pmid:1"] })],
      [
        tu("record_finding", {
          claim: "The randomized secukinumab trial in Crohn's disease was terminated for futility",
          direction: "opposes",
          outcome: "negative",
          kind: "observation",
          sourceIds: ["ctgov:NCT00584740"],
          supportingPassage: "terminated prematurely after futility criterion was met",
          population: "Moderate to severe active Crohn's disease",
        }),
      ],
      [tu("finalize_brief", { ...goodBrief, opposingEvidence: [], keyFindings: [{ text: "x x x x x", findingIds: ["F9"] }], summary: { text: "Summary without the opposing finding.", findingIds: ["F9"] } })],
      [tu("finalize_brief", goodBrief)],
    ]);

    const res = await runInvestigation({ runId: store.id, goal: "IL-17A inhibition in Crohn's disease", model: MODELS.haiku, client, spend, store });

    expect(res.status).toBe("completed");
    expect(res.steps).toBe(6);
    expect(res.ledger.findings).toHaveLength(1);
    // Unknown source rejected, then brief rejected for dropping opposing finding F1 / unknown F9.
    const errors = res.events.filter((e) => e.type === "tool_result" && !e.ok).map((e) => (e as { summary: string }).summary);
    expect(errors[0]).toMatch(/Unknown source ID/);
    expect(errors[1]).toMatch(/Opposing findings F1/);
    expect(errors[1]).toMatch(/unknown finding IDs F9/);
    // Tool errors reach the model as is_error tool results.
    const thirdCallLast = calls[3].messages[calls[3].messages.length - 1];
    expect(JSON.stringify(thirdCallLast.content)).toContain('"is_error":true');
    // Stages come from tools, in order.
    const stages = res.events.filter((e) => e.type === "stage").map((e) => (e as { stage: string }).stage);
    expect(stages).toEqual(["planning", "reading", "searching", "comparing", "comparing", "writing", "writing"]);
    const labels = res.events.filter((e) => e.type === "stage").map((e) => (e as { label: string }).label);
    expect(labels[1]).toBe("Retrieving NCT00584740");
    expect(labels[2]).toMatch(/for counterevidence/);
    expect(res.events.at(-1)).toMatchObject({ type: "finished", status: "completed", assessment: "opposed" });
    // Caching and spend.
    expect(calls[0].cache_control).toEqual({ type: "ephemeral" });
    expect(await spend.total()).toBeGreaterThan(0);
    // Folder contents.
    const files = await fs.readdir(store.dir);
    expect(files).toEqual(expect.arrayContaining(["brief.md", "brief.json", "evidence.json", "sources.json", "run.json", "events.jsonl"]));
    const md = await fs.readFile(path.join(store.dir, "brief.md"), "utf8");
    expect(md).toMatch(/\*\*Assessment:\*\* Opposed by retrieved evidence/);
    expect(md).toMatch(/^1\. \[.+\]\(https:\/\/clinicaltrials\.gov\/study\/NCT00584740\)/m);
    expect(md).toMatch(/futility\. \[1\]/);
    expect(await fs.readdir(path.join(store.dir, "figures"))).toEqual(["evidence-map.svg", "timeline.svg"]);
    const run = JSON.parse(await fs.readFile(path.join(store.dir, "run.json"), "utf8"));
    expect(run.status).toBe("completed");
    expect(run.usage.calls).toBe(6);
  });

  it("refuses to finalize without a counterevidence search", async () => {
    mockFetch([["/studies/NCT00584740", fixture("ctgov-NCT00584740.json")]]);
    const { spend } = await tmp();
    const { client } = scripted([
      [tu("get_trial", { nctId: "NCT00584740" })],
      [tu("record_finding", { claim: "Trial terminated for futility at interim", direction: "opposes", outcome: "negative", kind: "interpretation", sourceIds: ["ctgov:NCT00584740"] })],
      [tu("finalize_brief", goodBrief)],
    ]);
    const res = await runInvestigation({ runId: "r", goal: "g", model: MODELS.haiku, client, spend, store: null, limits: { maxSteps: 4 } });
    expect(res.status).toBe("stopped");
    const err = res.events.find((e) => e.type === "tool_result" && !e.ok) as { summary: string };
    expect(err.summary).toMatch(/No counterevidence search/);
  });

  it("forces finalize near the budget and stops at the per-run cap", async () => {
    const { spend } = await tmp();
    // Haiku: 2,000,000 input tokens = $0.20 per call.
    const { client, calls } = scripted([[tu("update_plan", { steps: [{ title: "a b c", status: "pending" }, { title: "d e f", status: "pending" }] })]], {
      input_tokens: 2_000_000,
      output_tokens: 0,
    });
    const res = await runInvestigation({ runId: "r", goal: "g", model: MODELS.haiku, client, spend, store: null, limits: { perRunCapUsd: 0.5 } });
    expect(res.status).toBe("stopped");
    expect(res.stopReason).toMatch(/Per-run budget \$0\.50/);
    expect(calls).toHaveLength(3);
    expect(calls[0].tool_choice).toBeUndefined();
    expect(calls[2].tool_choice).toEqual({ type: "tool", name: "finalize_brief" });
    expect(res.events.some((e) => e.type === "notice")).toBe(true);
  });

  it("stops when the global spend cap is already reached", async () => {
    const { root } = await tmp();
    const spend = new SpendLedger(path.join(root, "s.json"), 0.01);
    await spend.record("old", MODELS.haiku, 0.02);
    const { client, calls } = scripted([[tu("update_plan", { steps: [] })]]);
    const res = await runInvestigation({ runId: "r", goal: "g", model: MODELS.haiku, client, spend, store: null });
    expect(res.status).toBe("stopped");
    expect(res.stopReason).toMatch(/Global API budget/);
    expect(calls).toHaveLength(0);
  });

  it("returns schema errors to the model and stops at the step limit", async () => {
    const { spend } = await tmp();
    const { client } = scripted([[tu("get_trial", { nctId: "bad" })]]);
    const res = await runInvestigation({ runId: "r", goal: "g", model: MODELS.haiku, client, spend, store: null, limits: { maxSteps: 3 } });
    expect(res.status).toBe("stopped");
    expect(res.stopReason).toMatch(/Step limit/);
    expect(res.events.filter((e) => e.type === "tool_result" && !e.ok)[0]).toMatchObject({ summary: expect.stringMatching(/Invalid input: nctId/) });
  });

  it("records an adapter failure as a tool error instead of crashing", async () => {
    mockFetch([["/studies/NCT00000001", "boom", 500]]);
    const { spend } = await tmp();
    const { client } = scripted([[tu("get_trial", { nctId: "NCT00000001" })]]);
    const res = await runInvestigation({ runId: "r", goal: "g", model: MODELS.haiku, client, spend, store: null, limits: { maxSteps: 1 } });
    expect(res.events.find((e) => e.type === "tool_result")).toMatchObject({ ok: false, summary: expect.stringMatching(/Tool failed/) });
  }, 15_000);
});
