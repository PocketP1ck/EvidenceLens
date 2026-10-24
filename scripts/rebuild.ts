/**
 * Re-derive clusters, study counts, brief.md and figures for saved runs (no model calls).
 *   npm run rebuild -- <run-id> [<run-id>...]   (no args = all runs)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { INVESTIGATIONS_DIR } from "@/lib/config";
import { EvidenceLedger } from "@/lib/harness/ledger";
import { listInvestigations, loadInvestigation, RunStore } from "@/lib/harness/store";
import { renderBriefMarkdown } from "@/lib/harness/brief";
import { writeFigures } from "@/lib/figures";

async function rebuild(id: string) {
  const inv = await loadInvestigation(INVESTIGATIONS_DIR, id);
  if (!inv?.sources || !inv.evidence) return console.log(`skip ${id}: incomplete`);
  const ledger = new EvidenceLedger();
  for (const s of inv.sources.sources) ledger.sources.set(s.id, s);
  const evidence = { ...inv.evidence, clusters: ledger.clusters() };
  evidence.findings = evidence.findings.map((f) => ({ ...f, independentStudies: ledger.independentStudies(f.sourceIds) }));
  const store = new RunStore(INVESTIGATIONS_DIR, id);
  await store.writeJson("evidence.json", evidence);
  if (inv.brief) {
    await store.writeText("brief.md", renderBriefMarkdown(inv.brief, evidence, inv.sources.sources, { runId: id, model: inv.run.model, createdAt: inv.run.createdAt, usd: inv.run.usage.usd }));
    await writeFigures(store, inv.brief, evidence, inv.sources.sources);
  }
  console.log(`rebuilt ${id}: ${evidence.clusters.length} clusters, ${evidence.findings.length} findings`);
}

async function main() {
  const ids = process.argv.slice(2);
  const all = ids.length ? ids : (await listInvestigations(INVESTIGATIONS_DIR)).map((i) => i.id);
  for (const id of all) await rebuild(id);
  await fs.access(path.join(INVESTIGATIONS_DIR)).catch(() => undefined);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
