import type Anthropic from "@anthropic-ai/sdk";
import { LIMITS, type ModelId } from "@/lib/config";
import { addUsage, BudgetExceededError, costFromUsage, emptyTotals, type SpendLedger, type UsageTotals } from "./budget";
import { EvidenceLedger, LedgerError } from "./ledger";
import { goalMessage, SYSTEM_PROMPT } from "./prompt";
import type { RunStore } from "./store";
import { anthropicTools, TOOL_BY_NAME, type ToolContext } from "./tools";
import type { Brief, NewRunEvent, RunEvent, RunMeta, RunStatus } from "./types";
import { renderBriefMarkdown } from "./brief";
import { writeFigures } from "@/lib/figures";

type MessageParam = Anthropic.Messages.MessageParam;
type ContentBlockParam = Anthropic.Messages.ContentBlockParam;
type ToolResultBlockParam = Anthropic.Messages.ToolResultBlockParam;

/** The subset of the Anthropic client the harness needs; mocked in tests. */
export interface ModelClient {
  messages: { create(params: Anthropic.Messages.MessageCreateParamsNonStreaming): Promise<Anthropic.Messages.Message> };
}

export interface RunOptions {
  runId: string;
  goal: string;
  context?: RunMeta["context"];
  model: ModelId;
  client: ModelClient;
  spend: SpendLedger;
  store: RunStore | null;
  ledger?: EvidenceLedger;
  limits?: Partial<typeof LIMITS>;
  signal?: AbortSignal;
  onEvent?: (e: RunEvent) => void;
}

export interface RunResult {
  status: RunStatus;
  stopReason: string;
  brief: Brief | null;
  ledger: EvidenceLedger;
  usage: UsageTotals;
  steps: number;
  events: RunEvent[];
}

const FINALIZE_NOTICE =
  "HARNESS NOTICE: the run is close to its budget or step limit. Call finalize_brief now using the findings you have recorded. Put unresolved items under unknowns.";

export async function runInvestigation(opts: RunOptions): Promise<RunResult> {
  const limits = { ...LIMITS, ...opts.limits };
  const ledger = opts.ledger ?? new EvidenceLedger();
  const events: RunEvent[] = [];
  const started = Date.now();
  let localSeq = 0;
  let usage = emptyTotals();
  let brief: Brief | null = null;
  let steps = 0;
  let status: RunStatus = "running";
  let stopReason = "";
  let finalizeForced = false;
  let nudges = 0;

  const meta: RunMeta = {
    id: opts.runId,
    goal: opts.goal,
    context: opts.context ?? {},
    model: opts.model,
    status,
    createdAt: new Date().toISOString(),
    steps: 0,
    usage,
    limits: { perRunCapUsd: limits.perRunCapUsd, maxSteps: limits.maxSteps },
  };

  const emit = async (e: NewRunEvent) => {
    const ev = opts.store ? await opts.store.appendEvent(e) : ({ ...e, seq: ++localSeq, at: new Date().toISOString() } as RunEvent);
    events.push(ev);
    opts.onEvent?.(ev);
  };

  const persist = async () => {
    if (!opts.store) return;
    Object.assign(meta, { status, steps, usage, stopReason: stopReason || undefined });
    await opts.store.writeJson("run.json", meta);
    await opts.store.writeJson("evidence.json", ledger.toEvidenceFile());
    await opts.store.writeJson("sources.json", ledger.toSourcesFile());
  };

  const ctx: ToolContext = { ledger, store: opts.store, setBrief: (b) => (brief = b) };
  const tools = anthropicTools();
  const messages: MessageParam[] = [{ role: "user", content: goalMessage(opts.goal, opts.context ?? {}) }];

  await persist();
  await emit({ type: "run_started", goal: opts.goal, model: opts.model });

  try {
    while (!brief) {
      if (opts.signal?.aborted) {
        status = "stopped";
        stopReason = "Stopped by user";
        break;
      }
      if (steps >= limits.maxSteps) {
        status = "stopped";
        stopReason = `Step limit (${limits.maxSteps}) reached before the brief was finalized`;
        break;
      }
      if (usage.usd >= limits.perRunCapUsd) {
        status = "stopped";
        stopReason = `Per-run budget $${limits.perRunCapUsd.toFixed(2)} reached`;
        break;
      }
      if (Date.now() - started > limits.maxWallClockMs) {
        status = "stopped";
        stopReason = "Time limit reached";
        break;
      }
      await opts.spend.assertCanSpend();

      const nearLimit =
        usage.usd >= limits.perRunCapUsd * limits.finalizeAtFraction ||
        steps >= limits.maxSteps - 2 ||
        Date.now() - started > limits.maxWallClockMs * 0.85;
      if (nearLimit && !finalizeForced) {
        finalizeForced = true;
        appendText(messages, FINALIZE_NOTICE);
        await emit({ type: "notice", message: "Approaching limits; asking the agent to finalize." });
      }

      steps++;
      const response = await opts.client.messages.create({
        model: opts.model,
        max_tokens: limits.maxOutputTokensPerCall,
        system: SYSTEM_PROMPT,
        tools,
        messages,
        // Automatic prompt caching of the system prompt, tools and growing conversation.
        cache_control: { type: "ephemeral" },
        ...(finalizeForced ? { tool_choice: { type: "tool" as const, name: "finalize_brief" } } : {}),
      });

      const callUsd = costFromUsage(opts.model, response.usage);
      usage = addUsage(usage, opts.model, response.usage);
      await opts.spend.record(opts.runId, opts.model, callUsd);
      await emit({ type: "usage", usd: callUsd, runUsd: usage.usd });

      messages.push({ role: "assistant", content: response.content as ContentBlockParam[] });
      const toolUses = response.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");

      if (!toolUses.length) {
        if (response.stop_reason === "refusal") {
          status = "failed";
          stopReason = "Model declined the request";
          break;
        }
        if (++nudges > 2) {
          status = "stopped";
          stopReason = "Agent stopped calling tools without finalizing";
          break;
        }
        messages.push({ role: "user", content: "Continue the investigation with tools. Finish by calling finalize_brief." });
        await persist();
        continue;
      }

      const results: ToolResultBlockParam[] = [];
      for (const use of toolUses) {
        results.push(await executeTool(use, ctx, emit));
      }
      messages.push({ role: "user", content: results });
      await persist();
    }
    if (brief) {
      status = "completed";
      stopReason = "Brief finalized";
    }
  } catch (err) {
    status = err instanceof BudgetExceededError ? "stopped" : "failed";
    stopReason = err instanceof Error ? err.message : String(err);
  }

  if (brief && opts.store) {
    const b = brief as Brief;
    Object.assign(meta, { title: b.title, assessment: b.assessment });
    await opts.store.writeJson("brief.json", b);
    const evidence = ledger.toEvidenceFile();
    const sources = [...ledger.sources.values()];
    await opts.store.writeText("brief.md", renderBriefMarkdown(b, evidence, sources, { runId: opts.runId, model: opts.model, createdAt: meta.createdAt, usd: usage.usd }));
    try {
      await writeFigures(opts.store, b, evidence, sources);
    } catch (err) {
      await emit({ type: "notice", message: `Figure generation failed: ${(err as Error).message}` });
    }
  }
  meta.finishedAt = new Date().toISOString();
  await persist();
  const b = brief as Brief | null;
  await emit({ type: "finished", status, stopReason, title: b?.title, assessment: b?.assessment, summary: b?.summary.text });
  return { status, stopReason, brief: b, ledger, usage, steps, events };
}

async function executeTool(use: Anthropic.Messages.ToolUseBlock, ctx: ToolContext, emit: (e: NewRunEvent) => Promise<void>): Promise<ToolResultBlockParam> {
  const def = TOOL_BY_NAME.get(use.name);
  if (!def) return { type: "tool_result", tool_use_id: use.id, is_error: true, content: `Unknown tool ${use.name}` };
  const parsed = def.schema.safeParse(use.input);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    await emit({ type: "tool_result", tool: use.name, ok: false, summary: `Invalid input: ${issues}` });
    return { type: "tool_result", tool_use_id: use.id, is_error: true, content: `Invalid input: ${issues}` };
  }
  await emit({ type: "stage", stage: def.stage, label: def.label(parsed.data), tool: def.name, input: parsed.data });
  try {
    const out = await def.run(parsed.data, ctx);
    await emit({ type: "tool_result", tool: def.name, ok: true, summary: out.summary, sourceIds: out.sourceIds });
    if (def.name === "record_finding") {
      const f = ctx.ledger.findings[ctx.ledger.findings.length - 1];
      await emit({ type: "finding", findingId: f.id, direction: f.direction, claim: f.claim });
    }
    return { type: "tool_result", tool_use_id: use.id, content: out.content };
  } catch (err) {
    const msg = err instanceof LedgerError ? err.message : `Tool failed: ${(err as Error).message}`;
    await emit({ type: "tool_result", tool: def.name, ok: false, summary: msg.slice(0, 300) });
    return { type: "tool_result", tool_use_id: use.id, is_error: true, content: msg };
  }
}

function appendText(messages: MessageParam[], text: string) {
  const last = messages[messages.length - 1];
  if (last?.role === "user") {
    if (typeof last.content === "string") last.content = [{ type: "text", text: last.content }, { type: "text", text }];
    else last.content.push({ type: "text", text });
  } else messages.push({ role: "user", content: text });
}
