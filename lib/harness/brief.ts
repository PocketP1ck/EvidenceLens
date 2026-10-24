import type { SourceRecord } from "@/lib/adapters/types";
import type { EvidenceLedger } from "./ledger";
import { LedgerError } from "./ledger";
import type { Brief, BriefItem, EvidenceFile, Finding } from "./types";

const ASSESSMENT_LABEL: Record<Brief["assessment"], string> = {
  supported: "Supported by retrieved evidence",
  opposed: "Opposed by retrieved evidence",
  mixed: "Mixed evidence",
  insufficient: "Insufficient evidence",
};

export function assessmentLabel(a: Brief["assessment"]) {
  return ASSESSMENT_LABEL[a];
}

/**
 * Harness-side checks on the final brief. Errors are returned to the model so it can fix them.
 * - At least one counterevidence search must have run.
 * - Every claim item cites existing findings.
 * - Every opposing finding appears somewhere in the brief (it cannot be dropped).
 */
export function validateBrief(brief: Brief, ledger: EvidenceLedger): void {
  const problems: string[] = [];
  if (ledger.counterSearchCount() < 1) {
    problems.push('No counterevidence search has been run. Call search_literature or search_trials with intent "counter" before finalizing.');
  }
  if (!ledger.findings.length) problems.push("No findings recorded. Use record_finding before finalizing.");
  const items: [string, BriefItem][] = [
    ["summary", brief.summary],
    ...brief.keyFindings.map((x, i) => [`keyFindings[${i}]`, x] as [string, BriefItem]),
    ...brief.opposingEvidence.map((x, i) => [`opposingEvidence[${i}]`, x] as [string, BriefItem]),
    ...brief.contextDifferences.map((x, i) => [`contextDifferences[${i}]`, x] as [string, BriefItem]),
  ];
  for (const [where, item] of items) {
    if (!item.findingIds.length) problems.push(`${where} cites no findings.`);
    const unknown = item.findingIds.filter((id) => !ledger.findingExists(id));
    if (unknown.length) problems.push(`${where} cites unknown finding IDs ${unknown.join(", ")}.`);
  }
  const cited = new Set(items.flatMap(([, i]) => i.findingIds));
  const droppedOpposing = ledger.findings.filter((f) => f.direction === "opposes" && !cited.has(f.id)).map((f) => f.id);
  if (droppedOpposing.length) problems.push(`Opposing findings ${droppedOpposing.join(", ")} are not cited in the brief. Opposing evidence cannot be dropped.`);
  if (problems.length) throw new LedgerError(`Brief rejected:\n- ${problems.join("\n- ")}`);
}

/** Assign citation numbers to sources in order of first appearance through findings. */
export function citationIndex(brief: Brief, findings: Finding[]): Map<string, number> {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const order = new Map<string, number>();
  const items = [brief.summary, ...brief.keyFindings, ...brief.opposingEvidence, ...brief.contextDifferences];
  for (const item of items)
    for (const fid of item.findingIds)
      for (const sid of byId.get(fid)?.sourceIds ?? []) if (!order.has(sid)) order.set(sid, order.size + 1);
  for (const f of findings) for (const sid of f.sourceIds) if (!order.has(sid)) order.set(sid, order.size + 1);
  return order;
}

export function citeItem(item: BriefItem, findings: Finding[], index: Map<string, number>): number[] {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const nums = new Set<number>();
  for (const fid of item.findingIds) for (const sid of byId.get(fid)?.sourceIds ?? []) nums.add(index.get(sid)!);
  return [...nums].filter(Boolean).sort((a, b) => a - b);
}

const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

export function renderBriefMarkdown(brief: Brief, evidence: EvidenceFile, sources: SourceRecord[], meta: { runId: string; model: string; createdAt: string; usd: number }): string {
  const index = citationIndex(brief, evidence.findings);
  const srcById = new Map(sources.map((s) => [s.id, s]));
  const cite = (item: BriefItem) => {
    const nums = citeItem(item, evidence.findings, index);
    return nums.length ? ` ${nums.map((n) => `[${n}]`).join("")}` : "";
  };
  const list = (items: BriefItem[]) => (items.length ? items.map((i) => `- ${i.text}${cite(i)} _(${i.findingIds.join(", ")})_`).join("\n") : "- None recorded.");
  const plain = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- None recorded.");

  const lines: string[] = [
    `# ${brief.title}`,
    "",
    `**Question:** ${brief.question}`,
    "",
    `**Assessment:** ${assessmentLabel(brief.assessment)}. ${brief.summary.text}${cite(brief.summary)}`,
    "",
    "## Key findings",
    list(brief.keyFindings),
    "",
    "## Opposing evidence",
    list(brief.opposingEvidence),
    "",
    "## Context differences",
    list(brief.contextDifferences),
    "",
    "## Limitations",
    plain(brief.limitations),
    "",
    "## Unknowns",
    plain(brief.unknowns),
    "",
    "## Next research questions",
    plain(brief.nextQuestions),
    "",
    "## Evidence ledger",
    "",
    "| ID | Kind | Direction | Outcome | Claim | Population | Endpoint | Studies | Sources |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...evidence.findings.map(
      (f) =>
        `| ${f.id} | ${f.kind} | ${f.direction} | ${f.outcome.replace("_", " ")} | ${esc(f.claim)} | ${esc(f.population ?? "—")} | ${esc(f.endpoint ?? "—")} | ${f.independentStudies} | ${f.sourceIds.map((s) => `[${index.get(s)}]`).join("")} |`,
    ),
    "",
  ];
  if (evidence.gaps.length) {
    lines.push("## Evidence not retrieved", "", ...evidence.gaps.map((g) => `- **${g.id}** ${g.description} _(attempted: ${g.attempted})_`), "");
  }
  if (evidence.clusters.length) {
    lines.push("## Linked records", "", ...evidence.clusters.map((c) => `- ${c.label}: ${c.sourceIds.map((s) => (index.has(s) ? `[${index.get(s)}]` : s)).join(", ")}`), "");
  }
  if (evidence.structure) {
    const s = evidence.structure;
    lines.push(
      "## Structure",
      "",
      `- ${s.title} (${s.modelId}; ${s.type === "experimental" ? `${s.method ?? "experimental"}${s.resolution ? `, ${s.resolution} Å` : ""}` : `predicted, mean pLDDT ${s.meanPlddt}`})`,
      `- Identity: ${s.identity.method}`,
      `- Selection: ${s.reason}`,
      "",
    );
  }
  lines.push("## Sources", "");
  for (const [sid, n] of [...index.entries()].sort((a, b) => a[1] - b[1])) {
    const s = srcById.get(sid);
    if (!s) continue;
    lines.push(`${n}. [${esc(s.title)}](${s.url}) — ${s.source}, \`${s.id}\`${s.year ? `, ${s.year}` : ""}. Retrieved ${s.retrievedAt}.`);
  }
  lines.push(
    "",
    "---",
    `_Generated by EvidenceLens run \`${meta.runId}\` (${meta.model}, ${meta.createdAt}, API cost $${meta.usd.toFixed(3)}). Every claim cites findings recorded against retrieved sources. This is a research brief, not clinical advice._`,
    "",
  );
  return lines.join("\n");
}
