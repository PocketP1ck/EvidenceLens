/**
 * Run one investigation from the command line.
 *   npm run investigate -- --model haiku "IL-17A inhibition for Crohn's disease"
 *   npm run investigate -- --model sonnet --scratch "..."
 * Writes investigations/<run-id>/ (or investigations/_scratch/<run-id>/ with --scratch).
 */
import path from "node:path";
import fs from "node:fs";
import { INVESTIGATIONS_DIR, LIMITS, resolveModel, SPEND_FILE } from "@/lib/config";
import { getAnthropic } from "@/lib/harness/anthropic";
import { SpendLedger } from "@/lib/harness/budget";
import { runInvestigation } from "@/lib/harness/orchestrator";
import { makeRunId, RunStore } from "@/lib/harness/store";

if (fs.existsSync(".env.local")) process.loadEnvFile(".env.local");

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const bool = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return false;
  argv.splice(i, 1);
  return true;
};

const model = resolveModel(flag("model") ?? "haiku");
const target = flag("target");
const disease = flag("disease");
const compound = flag("compound");
const scratch = bool("scratch");
const goal = argv.join(" ").trim();
if (!goal) {
  console.error('Usage: npm run investigate -- [--model haiku|sonnet] [--scratch] "goal"');
  process.exit(1);
}

const root = scratch ? path.join(INVESTIGATIONS_DIR, "_scratch") : INVESTIGATIONS_DIR;
const spend = new SpendLedger(SPEND_FILE, LIMITS.globalCapUsd);

async function main() {
  console.log(`Model ${model}. Spent so far $${(await spend.total()).toFixed(4)} of $${LIMITS.globalCapUsd}.`);
  const store = await RunStore.create(root, makeRunId(goal));
  console.log(`Run folder: ${store.dir}`);
  const res = await runInvestigation({
    runId: store.id,
    goal,
    context: { target, disease, compound },
    model,
    client: getAnthropic(),
    spend,
    store,
    onEvent: (e) => {
      if (e.type === "stage") console.log(`[${e.stage}] ${e.label}`);
      else if (e.type === "tool_result" && !e.ok) console.log(`   ✗ ${e.summary}`);
      else if (e.type === "finding") console.log(`   + ${e.findingId} ${e.direction}: ${e.claim.slice(0, 100)}`);
      else if (e.type === "notice") console.log(`   ! ${e.message}`);
    },
  });
  console.log(`\n${res.status.toUpperCase()}: ${res.stopReason}`);
  console.log(`Steps ${res.steps}, calls ${res.usage.calls}, tokens in ${res.usage.inputTokens} / cache read ${res.usage.cacheReadTokens} / cache write ${res.usage.cacheWriteTokens} / out ${res.usage.outputTokens}`);
  console.log(`Run cost $${res.usage.usd.toFixed(4)}; total spent $${(await spend.total()).toFixed(4)}`);
  if (res.brief) console.log(`\n${res.brief.assessment.toUpperCase()}: ${res.brief.summary.text}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
