import { z } from "zod";
import { getTrial, searchTrials, type TrialData } from "@/lib/adapters/clinicaltrials";
import { getPublication, searchLiterature } from "@/lib/adapters/europepmc";
import { getAssociation, searchEntity } from "@/lib/adapters/opentargets";
import { findHumanAccession, getProtein, type ProteinData } from "@/lib/adapters/uniprot";
import { searchCompound, type CompoundData } from "@/lib/adapters/chembl";
import { findStructure } from "@/lib/adapters/structures";
import { fetchText } from "@/lib/adapters/http";
import { clip, type SourceRecord } from "@/lib/adapters/types";
import type { EvidenceLedger } from "./ledger";
import type { RunStore } from "./store";
import { validateBrief } from "./brief";
import type { Brief, Stage } from "./types";

export interface ToolContext {
  ledger: EvidenceLedger;
  store: RunStore | null;
  /** Set by finalize_brief. */
  setBrief: (b: Brief) => void;
}

export interface ToolOutput {
  /** Compact text returned to the model. */
  content: string;
  /** One-line summary for the event log / trace. */
  summary: string;
  sourceIds?: string[];
  final?: boolean;
}

export interface ToolDef<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  stage: Stage;
  /** Observable activity label derived from the input. Shown in the UI. */
  label: (input: z.infer<S>) => string;
  run: (input: z.infer<S>, ctx: ToolContext) => Promise<ToolOutput>;
}

const MAX_RESULT_CHARS = 7000;

function defineTool<S extends z.ZodType>(def: ToolDef<S>): ToolDef<S> {
  return def;
}

function trimResult(text: string) {
  return text.length <= MAX_RESULT_CHARS ? text : `${text.slice(0, MAX_RESULT_CHARS)}\n…[truncated by harness]`;
}

function listRecords(recs: SourceRecord[], excerpt = 380) {
  return recs.map((r) => `[${r.id}] ${r.title}${r.year ? ` (${r.year})` : ""}\n  ${clip(r.excerpt, excerpt)}`).join("\n");
}

const intent = z
  .enum(["support", "counter", "context"])
  .describe('Why you are searching. Use "counter" when looking for evidence that would weaken or refute the hypothesis.');

const tools = [
  defineTool({
    name: "update_plan",
    description: "Create or update your bounded investigation plan (2–8 steps). Call first, then update statuses as you go.",
    schema: z.object({
      steps: z
        .array(z.object({ title: z.string().min(3).max(140), status: z.enum(["pending", "in_progress", "done"]) }))
        .min(2)
        .max(8),
    }),
    stage: "planning",
    label: (i) => {
      const cur = i.steps.find((s) => s.status === "in_progress") ?? i.steps.find((s) => s.status === "pending");
      return cur ? `Planning: ${clip(cur.title, 70)}` : "Updating the plan";
    },
    run: async (i, ctx) => {
      ctx.ledger.plan = i.steps;
      return { content: `Plan saved (${i.steps.length} steps).`, summary: `Plan with ${i.steps.length} steps` };
    },
  }),

  defineTool({
    name: "resolve_entities",
    description:
      "Resolve a target gene/protein, disease and compound to database identifiers (Ensembl, UniProt, MONDO/EFO). Returns candidates; this is identifier resolution, not evidence.",
    schema: z.object({
      target: z.string().max(60).optional().describe("Gene symbol or protein name, e.g. IL17A"),
      disease: z.string().max(80).optional(),
      compound: z.string().max(60).optional(),
    }),
    stage: "searching",
    label: (i) => `Resolving ${[i.target, i.disease, i.compound].filter(Boolean).join(", ")}`,
    run: async (i, ctx) => {
      const out: string[] = [];
      if (i.target) {
        const hits = await searchEntity(i.target, "target");
        const top = hits[0];
        if (top) {
          const up = await findHumanAccession(top.name).catch(() => null);
          ctx.ledger.entities.target = { symbol: top.name, ensemblId: top.id, uniprot: up?.accession, name: top.description };
          out.push(`Target candidates: ${hits.map((h) => `${h.name} ${h.id} (${h.description})`).join("; ")}. Reviewed human UniProt for ${top.name}: ${up?.accession ?? "not found"}.`);
        } else out.push(`Target "${i.target}": no Open Targets match.`);
      }
      if (i.disease) {
        const hits = await searchEntity(i.disease, "disease");
        if (hits[0]) ctx.ledger.entities.disease = { id: hits[0].id, name: hits[0].name };
        out.push(hits.length ? `Disease candidates: ${hits.map((h) => `${h.name} ${h.id}`).join("; ")}.` : `Disease "${i.disease}": no match.`);
      }
      if (i.compound) {
        ctx.ledger.entities.compound = { name: i.compound };
        out.push(`Compound "${i.compound}" noted; use search_compounds for ChEMBL details.`);
      }
      return { content: out.join("\n") || "Nothing to resolve.", summary: clip(out.join(" "), 200) };
    },
  }),

  defineTool({
    name: "get_target_disease_evidence",
    description:
      "Open Targets target–disease association: overall score and per-datatype scores. Scores rank evidence and are NOT probabilities of therapeutic success.",
    schema: z.object({ ensemblId: z.string().describe("e.g. ENSG00000112115"), diseaseId: z.string().describe("e.g. MONDO_0005011") }),
    stage: "reading",
    label: (i) => `Reading Open Targets evidence for ${i.ensemblId} – ${i.diseaseId}`,
    run: async (i, ctx) => {
      const rec = ctx.ledger.register(await getAssociation(i.ensemblId, i.diseaseId));
      return { content: `[${rec.id}] ${rec.title}\n${rec.excerpt}`, summary: rec.excerpt.slice(0, 160), sourceIds: [rec.id] };
    },
  }),

  defineTool({
    name: "get_protein",
    description: "UniProt protein record: function, reviewed status, per-feature evidence counts.",
    schema: z.object({ accession: z.string().describe("UniProt accession, e.g. Q16552") }),
    stage: "reading",
    label: (i) => `Reading UniProt ${i.accession}`,
    run: async (i, ctx) => {
      const rec = ctx.ledger.register(await getProtein(i.accession));
      const d = rec.data as unknown as ProteinData;
      const feats = d.features.map((f) => `${f.type} ${f.count} (${f.withExperimentalEvidence} experimental)`).join(", ");
      const derived = `Function evidence: ${d.functionEvidence.experimental} experimental, ${d.functionEvidence.other} other.\nFeatures: ${feats}`;
      ctx.ledger.appendText(rec.id, derived);
      return {
        content: `[${rec.id}] ${rec.title}\n${rec.excerpt}\n${derived}\nNote: ${d.annotationNote}`,
        summary: rec.title,
        sourceIds: [rec.id],
      };
    },
  }),

  defineTool({
    name: "get_structure",
    description:
      "Select a 3D structure for the target: an experimental PDB complex with the named intervention if one exists (chain mapping verified), else an AlphaFold model with sequence identity checked. Never substitutes unrelated molecules.",
    schema: z.object({
      uniprotAccession: z.string(),
      interventionNames: z.array(z.string().min(3)).max(4).describe("Drug names to look for in PDB complexes, e.g. [\"secukinumab\"]"),
    }),
    stage: "reading",
    label: (i) => `Selecting a structure for ${i.uniprotAccession}${i.interventionNames.length ? ` with ${i.interventionNames.join("/")}` : ""}`,
    run: async (i, ctx) => {
      let protein = ctx.ledger.sources.get(`uniprot:${i.uniprotAccession}`);
      if (!protein) protein = ctx.ledger.register(await getProtein(i.uniprotAccession));
      const seq = (protein.data as unknown as ProteinData).sequence;
      const res = await findStructure({ uniprotAccession: i.uniprotAccession, interventionNames: i.interventionNames, uniprotSequence: seq });
      ctx.ledger.registerAll(res.records);
      if (!res.choice) {
        ctx.ledger.addGap(`No suitable 3D structure for ${i.uniprotAccession}`, `RCSB PDB + AlphaFold DB; ${res.notes.join(" ")}`);
        return { content: `No structure selected. ${res.notes.join(" ")} A gap was recorded.`, summary: "No structure available" };
      }
      const c = res.choice;
      if (ctx.store) {
        const fileName = `${c.modelId.split(" ")[0].toLowerCase()}.${c.format}`;
        try {
          const file = await fetchText(c.type === "experimental" ? "RCSB PDB" : "AlphaFold DB", c.fileUrl);
          await ctx.store.saveFile("structures", fileName, file);
          ctx.ledger.structure = { ...c, localFile: fileName };
        } catch (err) {
          ctx.ledger.structure = c;
          res.notes.push(`Download failed: ${(err as Error).message}`);
        }
      } else ctx.ledger.structure = c;
      const partners = c.partnerChains.map((p) => `${p.label} [${p.chains.join(",")}] (${p.role})`).join("; ");
      return {
        content: `[${c.sourceId}] ${c.title} — ${c.type}${c.resolution ? `, ${c.resolution} Å` : ""}${c.meanPlddt ? `, mean pLDDT ${c.meanPlddt}` : ""}.\nTarget chains: ${c.targetChains.join(",")}. Partners: ${partners || "none"}.\nIdentity: ${c.identity.method}.\nSelection: ${c.reason}\n${res.notes.join(" ")}\nOther PDB entries mapping to the target: ${res.considered.length}.`,
        summary: `${c.modelId}: ${c.title}`,
        sourceIds: [c.sourceId],
      };
    },
  }),

  defineTool({
    name: "search_compounds",
    description: "ChEMBL lookup for a compound by name: max phase, mechanism of action with target UniProt join, and indications with max phase per indication.",
    schema: z.object({ name: z.string().min(2).max(60) }),
    stage: "searching",
    label: (i) => `Searching ChEMBL for ${i.name}`,
    run: async (i, ctx) => {
      const recs = ctx.ledger.registerAll(await searchCompound(i.name));
      if (!recs.length) return { content: `No ChEMBL molecule matched "${i.name}".`, summary: "No ChEMBL match" };
      const rec = recs[0];
      const d = rec.data as unknown as CompoundData;
      const tgt = ctx.ledger.entities.target?.uniprot;
      const join = tgt
        ? d.mechanisms.some((m) => m.targetUniprot.includes(tgt))
          ? `Mechanism target maps to investigation target ${tgt} (joined in code).`
          : `WARNING: no mechanism target maps to investigation target ${tgt}.`
        : "Investigation target UniProt not resolved; no join performed.";
      if (ctx.ledger.entities.compound) ctx.ledger.entities.compound.chemblId = d.chemblId;
      else ctx.ledger.entities.compound = { name: i.name, chemblId: d.chemblId };
      const acts = d.activities.length ? `\nActivities: ${d.activities.map((a) => `${a.type} ${a.relation ?? ""}${a.value ?? "?"} ${a.units ?? ""} [${a.assayType}]`).join("; ")}` : "";
      if (acts) ctx.ledger.appendText(rec.id, acts.trim());
      return { content: `[${rec.id}] ${rec.title}\n${rec.excerpt}\n${join}${acts}`, summary: `${rec.title}: ${join}`, sourceIds: [rec.id] };
    },
  }),

  defineTool({
    name: "search_literature",
    description:
      "Europe PMC search. Every term must appear in title or abstract (use trailing * for stems, e.g. crohn*). Returns PMIDs, years and abstract excerpts.",
    schema: z.object({
      terms: z.array(z.string().min(2).max(60)).min(1).max(5),
      extra: z.string().max(200).optional().describe('Optional raw Europe PMC clause, e.g. PUB_TYPE:"Randomized Controlled Trial"'),
      sort: z.enum(["relevance", "cited", "recent"]).optional().describe('Default "cited" surfaces pivotal primary studies; "recent" finds the latest reports'),
      max: z.number().int().min(1).max(10).optional(),
      intent,
    }),
    stage: "searching",
    label: (i) => `Searching Europe PMC${i.intent === "counter" ? " for counterevidence" : ""}: ${i.terms.join(" + ")}`,
    run: async (i, ctx) => {
      const res = await searchLiterature({ terms: i.terms, extra: i.extra, sort: i.sort ?? "cited", max: i.max ?? 6 });
      const recs = ctx.ledger.registerAll(res.records);
      ctx.ledger.logSearch({ tool: "search_literature", intent: i.intent, query: res.query, resultCount: recs.length });
      return {
        content: trimResult(recs.length ? `${res.hitCount} hits; showing ${recs.length}:\n${listRecords(recs)}` : `No publications matched ${res.query}.`),
        summary: `${recs.length} of ${res.hitCount} publications`,
        sourceIds: recs.map((r) => r.id),
      };
    },
  }),

  defineTool({
    name: "get_publication",
    description: "Fetch one publication by PMID with its full abstract.",
    schema: z.object({ pmid: z.string().regex(/^\d{1,9}$/) }),
    stage: "reading",
    label: (i) => `Reading PMID ${i.pmid}`,
    run: async (i, ctx) => {
      const rec = ctx.ledger.register(await getPublication(i.pmid));
      const d = rec.data as { journal?: string; pubTypes?: string[]; citedByCount?: number };
      return {
        content: trimResult(`[${rec.id}] ${rec.title} (${rec.year ?? "?"}, ${d.journal ?? "?"}; ${d.pubTypes?.join(", ")}; cited ${d.citedByCount})\nIdentifiers: ${JSON.stringify(rec.identifiers)}; linked trials: ${rec.linked.map((l) => l.nct).join(", ") || "none"}\nAbstract: ${rec.text}`),
        summary: rec.title,
        sourceIds: [rec.id],
      };
    },
  }),

  defineTool({
    name: "search_trials",
    description: "ClinicalTrials.gov search by condition and/or intervention. Returns registrations with status, phase, design, enrollment and whether results are posted.",
    schema: z.object({
      condition: z.string().max(80).optional(),
      intervention: z.string().max(80).optional(),
      term: z.string().max(80).optional(),
      max: z.number().int().min(1).max(10).optional(),
      intent,
    }),
    stage: "searching",
    label: (i) => `Searching ClinicalTrials.gov${i.intent === "counter" ? " for counterevidence" : ""}: ${[i.intervention, i.condition, i.term].filter(Boolean).join(" in ")}`,
    run: async (i, ctx) => {
      if (!i.condition && !i.intervention && !i.term) throw new Error("Provide condition, intervention or term.");
      const recs = ctx.ledger.registerAll(await searchTrials({ condition: i.condition, intervention: i.intervention, term: i.term, max: i.max ?? 8 }));
      ctx.ledger.logSearch({ tool: "search_trials", intent: i.intent, query: JSON.stringify({ condition: i.condition, intervention: i.intervention, term: i.term }), resultCount: recs.length });
      const listing = recs
        .map((r) => {
          const refs = (r.data as unknown as TrialData).references;
          return `[${r.id}] ${r.title}${r.year ? ` (${r.year})` : ""}\n  ${clip(r.excerpt, 300)}${refs.length ? `\n  Linked publications: ${refs.map((x) => `PMID ${x.pmid} (${x.type ?? "?"})`).join(", ")}` : ""}`;
        })
        .join("\n");
      return {
        content: trimResult(recs.length ? listing : "No registered trials matched."),
        summary: `${recs.length} trial registrations`,
        sourceIds: recs.map((r) => r.id),
      };
    },
  }),

  defineTool({
    name: "get_trial",
    description: "Full ClinicalTrials.gov record: design, arms, eligibility, primary outcomes, posted results with group values, adverse-event totals, linked PMIDs.",
    schema: z.object({ nctId: z.string().regex(/^NCT\d{8}$/) }),
    stage: "reading",
    label: (i) => `Retrieving ${i.nctId}`,
    run: async (i, ctx) => {
      const rec = ctx.ledger.register(await getTrial(i.nctId));
      const d = rec.data as unknown as TrialData;
      const lines = [
        `[${rec.id}] ${rec.title}`,
        `Org study ID: ${d.orgStudyId ?? "?"}; sponsor ${d.sponsor ?? "?"}; ${d.phases.join("/") || "NA"}; ${d.studyType}; allocation ${d.allocation}; masking ${d.masking}; enrollment ${d.enrollment} (${d.enrollmentType}); ${d.startDate} → ${d.completionDate}`,
        `Status: ${d.status}${d.whyStopped ? `; why stopped: ${d.whyStopped}` : ""}; results posted: ${d.hasResults ? "yes" : "no"}`,
        `Conditions: ${d.conditions.join("; ")}`,
        `Arms: ${d.arms.join(" | ")}`,
        `Primary outcomes (registered): ${d.primaryOutcomes.join(" | ")}`,
        ...d.results.map((r) => `${r.type} RESULT — ${r.title}${r.timeFrame ? ` [${r.timeFrame}]` : ""}${r.unit ? ` (${r.unit})` : ""}: ${r.summary}${r.pValues.length ? `; p=${r.pValues.join(", ")}` : ""}`),
        d.adverseEvents.length ? `Adverse events (affected/at risk): ${d.adverseEvents.map((a) => `${a.group}: serious ${a.serious}, other ${a.other}`).join("; ")}` : "",
        d.references.length ? `References: ${d.references.map((r) => `PMID ${r.pmid} (${r.type})`).join("; ")}` : "References: none listed",
        `Eligibility (excerpt): ${d.eligibility ?? "?"}`,
      ];
      const content = lines.filter(Boolean).join("\n");
      ctx.ledger.appendText(rec.id, content);
      return { content: trimResult(content), summary: `${d.nctId}: ${d.status}, ${d.phases.join("/")}, n=${d.enrollment}`, sourceIds: [rec.id] };
    },
  }),

  defineTool({
    name: "compare_studies",
    description: "Build a side-by-side comparison of retrieved trials (design, phase, population, status, primary endpoint, key result), computed from the records in code.",
    schema: z.object({ sourceIds: z.array(z.string()).min(1).max(6) }),
    stage: "comparing",
    label: (i) => `Comparing ${i.sourceIds.map((s) => s.replace(/^ctgov:/, "")).join(" and ")}`,
    run: async (i, ctx) => {
      const cmp = ctx.ledger.compareTrials(i.sourceIds);
      const rows = cmp.rows.map((r) => `${r.label}: ${r.phase}, ${r.design}, n=${r.enrollment ?? "?"}, ${r.status}; population: ${clip(r.population, 200)}; primary: ${r.primaryEndpoint}; result: ${clip(r.keyResult, 260)}`);
      return { content: `Comparison ${cmp.id}:\n${rows.join("\n")}`, summary: `Compared ${cmp.rows.length} trials`, sourceIds: cmp.sourceIds };
    },
  }),

  defineTool({
    name: "record_finding",
    description:
      "Record one finding in the evidence ledger. Cite only source IDs returned by tools. Observations must include supportingPassage quoted verbatim from a cited source (use ... to elide). Keep population, endpoint and context specific; do not generalize across diseases.",
    schema: z.object({
      claim: z.string().min(10).max(400),
      direction: z.enum(["supports", "opposes", "context"]).describe("Relative to the hypothesis under investigation"),
      outcome: z.enum(["positive", "negative", "null", "not_posted", "not_applicable"]).describe("negative = worse than comparator; null = no detectable difference; not_posted = results not available"),
      kind: z.enum(["observation", "interpretation", "hypothesis"]),
      sourceIds: z.array(z.string()).min(1).max(6),
      supportingPassage: z.string().max(600).optional(),
      intervention: z.string().max(120).optional(),
      disease: z.string().max(120).optional(),
      population: z.string().max(200).optional(),
      species: z.string().max(60).optional(),
      endpoint: z.string().max(200).optional(),
      studyContext: z.string().max(240).optional(),
      limitations: z.string().max(300).optional(),
    }),
    stage: "comparing",
    label: (i) => `Recording ${i.direction === "opposes" ? "an opposing" : i.direction === "supports" ? "a supporting" : "a context"} finding: ${clip(i.claim, 60)}`,
    run: async (i, ctx) => {
      const f = ctx.ledger.addFinding(i);
      const note = f.sourceIds.length > f.independentStudies ? ` Note: the ${f.sourceIds.length} cited records represent ${f.independentStudies} distinct study/report(s).` : "";
      return {
        content: `Recorded ${f.id} (${f.direction}, ${f.kind}).${note}\nLedger so far:\n${ctx.ledger.findingIndex()}`,
        summary: `${f.id} ${f.direction}: ${clip(f.claim, 120)}`,
        sourceIds: f.sourceIds,
      };
    },
  }),

  defineTool({
    name: "record_gap",
    description: "Record evidence you looked for but could not retrieve (distinct from null or negative results).",
    schema: z.object({ description: z.string().min(10).max(300), attempted: z.string().min(3).max(300).describe("What you searched") }),
    stage: "comparing",
    label: () => "Noting evidence that could not be retrieved",
    run: async (i, ctx) => {
      const g = ctx.ledger.addGap(i.description, i.attempted);
      return { content: `Recorded gap ${g.id}.`, summary: `${g.id}: ${clip(g.description, 120)}` };
    },
  }),

  defineTool({
    name: "finalize_brief",
    description:
      "Finish the investigation with a structured brief. Every summary/finding/opposing/context item must cite finding IDs (F1, F2…). All opposing findings must be cited. Requires at least one counterevidence search. If rejected, fix the listed problems and call again.",
    schema: z.object({
      title: z.string().min(5).max(120),
      question: z.string().min(5).max(300),
      assessment: z.enum(["supported", "opposed", "mixed", "insufficient"]),
      summary: z.object({ text: z.string().min(10).max(600), findingIds: z.array(z.string()).min(1) }),
      keyFindings: z.array(z.object({ text: z.string().min(5).max(400), findingIds: z.array(z.string()).min(1) })).min(1).max(8),
      opposingEvidence: z.array(z.object({ text: z.string().min(5).max(400), findingIds: z.array(z.string()).min(1) })).max(8),
      contextDifferences: z.array(z.object({ text: z.string().min(5).max(400), findingIds: z.array(z.string()).min(1) })).max(8),
      limitations: z.array(z.string().max(300)).max(8),
      unknowns: z.array(z.string().max(300)).max(8),
      nextQuestions: z.array(z.string().max(300)).min(1).max(6),
    }),
    stage: "writing",
    label: () => "Writing the research brief",
    run: async (i, ctx) => {
      validateBrief(i, ctx.ledger);
      ctx.setBrief(i);
      return { content: "Brief accepted. The investigation is complete.", summary: `Brief: ${i.assessment}`, final: true };
    },
  }),
];

export const TOOLS: ToolDef[] = tools as unknown as ToolDef[];
export const TOOL_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/** Anthropic tool definitions generated from the zod schemas. */
export function anthropicTools() {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(t.schema) as Record<string, unknown>;
    delete schema.$schema;
    return { name: t.name, description: t.description, input_schema: schema as { type: "object"; [k: string]: unknown } };
  });
}
