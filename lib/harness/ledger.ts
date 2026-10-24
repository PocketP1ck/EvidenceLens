import type { Identifiers, SourceRecord } from "@/lib/adapters/types";
import type { StructureChoice } from "@/lib/adapters/structures";
import type {
  Cluster,
  Comparison,
  ComparisonRow,
  Direction,
  Entities,
  EvidenceFile,
  Finding,
  FindingKind,
  Gap,
  Outcome,
  PlanStep,
  SearchLog,
} from "./types";
import type { TrialData } from "@/lib/adapters/clinicaltrials";

/** Errors the model can act on; returned to it as tool errors. */
export class LedgerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LedgerError";
  }
}

export interface FindingInput {
  claim: string;
  direction: Direction;
  outcome: Outcome;
  kind: FindingKind;
  sourceIds: string[];
  supportingPassage?: string;
  intervention?: string;
  disease?: string;
  population?: string;
  species?: string;
  endpoint?: string;
  studyContext?: string;
  limitations?: string;
}

/** Normalize text for verbatim-quote checks: case, unicode punctuation, whitespace. */
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019\u201c\u201d"'`]/g, "")
    .replace(/[^a-z0-9%.,;:<>=≥≤±+\-/()\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A passage may use "..." / "…" to elide text; every segment must appear in the source. */
export function passageFound(passage: string, sourceText: string): boolean {
  const hay = normalizeForMatch(sourceText);
  const segments = passage
    .split(/\.\.\.|…/)
    .map(normalizeForMatch)
    .filter((s) => s.length > 0);
  return segments.length > 0 && segments.every((s) => hay.includes(s));
}

function identifierKeys(ids: Identifiers): string[] {
  const keys: string[] = [];
  if (ids.pmid) keys.push(`pmid:${ids.pmid}`);
  if (ids.pmcid) keys.push(`pmcid:${ids.pmcid.toUpperCase()}`);
  if (ids.nct) keys.push(`nct:${ids.nct.toUpperCase()}`);
  if (ids.doi) keys.push(`doi:${ids.doi.toLowerCase()}`);
  return keys;
}

/**
 * Sponsor study-ID key for trial registrations. Extension registrations usually reuse the
 * core protocol ID with a suffix (e.g. CAIN457A2202 → CAIN457A2202E1), so both map to one key.
 */
export function protocolKey(rec: SourceRecord): string | null {
  if (rec.kind !== "trial") return null;
  const d = rec.data as { orgStudyId?: string; sponsor?: string };
  if (!d.orgStudyId || d.orgStudyId.length < 6) return null;
  const base = d.orgStudyId.toUpperCase().replace(/[-_ ]?(E\d{1,2}|EXT\d*|OLE\d*)$/, "");
  return `protocol:${(d.sponsor ?? "").toLowerCase()}:${base}`;
}

export class EvidenceLedger {
  readonly sources = new Map<string, SourceRecord>();
  readonly findings: Finding[] = [];
  readonly gaps: Gap[] = [];
  readonly comparisons: Comparison[] = [];
  readonly searches: SearchLog[] = [];
  plan: PlanStep[] = [];
  entities: Entities = {};
  structure: StructureChoice | null = null;

  /** Adapters are the only callers. Re-registering an ID keeps the richer (latest) record. */
  register(rec: SourceRecord): SourceRecord {
    const prev = this.sources.get(rec.id);
    // Everything shown to the model about a source must be verifiable against its text.
    const own = rec.text.includes(rec.excerpt) ? rec.text : `${rec.excerpt}\n${rec.text}`;
    const merged: SourceRecord = prev
      ? {
          ...rec,
          text: own.length >= prev.text.length ? own : prev.text,
          linked: dedupeIds([...prev.linked, ...rec.linked]),
          identifiers: { ...prev.identifiers, ...stripUndefined(rec.identifiers) },
        }
      : { ...rec, text: own };
    this.sources.set(rec.id, merged);
    return merged;
  }

  /** Add record-derived text that was shown to the model (e.g. formatted trial results). */
  appendText(id: string, text: string) {
    const rec = this.sources.get(id);
    if (rec && !rec.text.includes(text)) rec.text = `${rec.text}\n${text}`;
  }

  /** Compact view of recorded findings, returned to the model to keep IDs straight. */
  findingIndex(): string {
    return this.findings.map((f) => `${f.id} ${f.direction}: ${f.claim.slice(0, 90)}`).join("\n");
  }

  registerAll(recs: SourceRecord[]): SourceRecord[] {
    return recs.map((r) => this.register(r));
  }

  has(id: string) {
    return this.sources.has(id);
  }

  logSearch(entry: Omit<SearchLog, "at">) {
    this.searches.push({ ...entry, at: new Date().toISOString() });
  }

  counterSearchCount() {
    return this.searches.filter((s) => s.intent === "counter").length;
  }

  /** Union-find over shared PMID/PMCID/NCT/DOI, including links (e.g. a trial's results paper). */
  clusters(): Cluster[] {
    const ids = [...this.sources.keys()];
    const parent = new Map(ids.map((id) => [id, id]));
    const find = (x: string): string => {
      const p = parent.get(x)!;
      if (p === x) return x;
      const r = find(p);
      parent.set(x, r);
      return r;
    };
    const union = (a: string, b: string) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent.set(rb, ra);
    };
    const keyOwner = new Map<string, string>();
    const shared = new Map<string, Set<string>>();
    for (const [id, rec] of this.sources) {
      const proto = protocolKey(rec);
      const keys = [...identifierKeys(rec.identifiers), ...rec.linked.flatMap(identifierKeys), ...(proto ? [proto] : [])];
      for (const k of keys) {
        const owner = keyOwner.get(k);
        if (owner) {
          union(owner, id);
          const set = shared.get(k) ?? new Set([owner]);
          set.add(id);
          shared.set(k, set);
        } else keyOwner.set(k, id);
      }
    }
    const groups = new Map<string, string[]>();
    for (const id of ids) {
      const r = find(id);
      groups.set(r, [...(groups.get(r) ?? []), id]);
    }
    let n = 0;
    return [...groups.values()]
      .filter((g) => g.length > 1)
      .map((sourceIds) => {
        const keys = [...shared.entries()].filter(([, s]) => [...s].some((x) => sourceIds.includes(x))).map(([k]) => k);
        const names = [...sourceIds]
          .sort()
          .slice(0, 4)
          .map((s) => s.replace(/^ctgov:/, "").replace(/^pmid:/, "PMID ").replace(/^pmcid:/, ""));
        return {
          id: `C${++n}`,
          label: `Linked records (${names.join(" ↔ ")}): one study or report, not independent corroboration`,
          sourceIds,
          sharedIdentifiers: keys,
        };
      });
  }

  /** Number of distinct studies among the given sources. */
  independentStudies(sourceIds: string[]): number {
    const clusterOf = new Map<string, string>();
    for (const c of this.clusters()) for (const s of c.sourceIds) clusterOf.set(s, c.id);
    return new Set(sourceIds.map((s) => clusterOf.get(s) ?? s)).size;
  }

  addFinding(input: FindingInput): Finding {
    const sourceIds = [...new Set(input.sourceIds)];
    if (!input.claim?.trim()) throw new LedgerError("claim is required.");
    if (!sourceIds.length) throw new LedgerError("A finding must cite at least one retrieved source ID.");
    const unknown = sourceIds.filter((id) => !this.sources.has(id));
    if (unknown.length) {
      throw new LedgerError(
        `Unknown source ID(s): ${unknown.join(", ")}. Cite only IDs returned by tools in this run (e.g. ${[...this.sources.keys()].slice(0, 5).join(", ") || "none yet"}).`,
      );
    }
    if (input.kind === "observation") {
      if (!input.supportingPassage || input.supportingPassage.trim().length < 12) {
        throw new LedgerError("Observations need a supportingPassage of at least 12 characters quoted verbatim from a cited source.");
      }
      const found = sourceIds.some((id) => passageFound(input.supportingPassage!, this.sources.get(id)!.text));
      if (!found) {
        throw new LedgerError(
          "supportingPassage was not found verbatim in any cited source's retrieved text. Quote the source exactly (use ... to elide), or record the claim as an interpretation.",
        );
      }
    }
    const finding: Finding = {
      ...input,
      sourceIds,
      id: `F${this.findings.length + 1}`,
      independentStudies: this.independentStudies(sourceIds),
      recordedAt: new Date().toISOString(),
    };
    this.findings.push(finding);
    return finding;
  }

  addGap(description: string, attempted: string): Gap {
    if (!description.trim()) throw new LedgerError("description is required.");
    const gap: Gap = { id: `G${this.gaps.length + 1}`, description, attempted, recordedAt: new Date().toISOString() };
    this.gaps.push(gap);
    return gap;
  }

  /** Context comparison computed in code from retrieved trial records. */
  compareTrials(sourceIds: string[]): Comparison {
    const unknown = sourceIds.filter((id) => !this.sources.has(id));
    if (unknown.length) throw new LedgerError(`Unknown source ID(s): ${unknown.join(", ")}`);
    const trials = sourceIds.map((id) => this.sources.get(id)!).filter((r) => r.kind === "trial");
    if (trials.length < 1) throw new LedgerError("compare_studies needs at least one ClinicalTrials.gov record (ctgov:NCT...).");
    const rows: ComparisonRow[] = trials.map((r) => {
      const d = r.data as unknown as TrialData;
      const primary = d.results.find((x) => x.type === "PRIMARY");
      return {
        sourceId: r.id,
        label: `${d.nctId}${d.orgStudyId ? ` (${d.orgStudyId})` : ""}`,
        year: r.year,
        design: [d.allocation && d.allocation !== "NA" ? d.allocation.toLowerCase() : "non-randomized/single-group", d.masking && d.masking !== "NONE" ? `${d.masking.toLowerCase()}-masked` : "open-label"].join(", "),
        phase: d.phases.join("/") || "NA",
        population: (d.conditions.join("; ") || "?") + (d.eligibility ? ` — ${d.eligibility.slice(0, 160)}` : ""),
        enrollment: d.enrollment,
        status: `${d.status ?? "?"}${d.whyStopped ? ` (${d.whyStopped})` : ""}`,
        primaryEndpoint: d.primaryOutcomes[0] ?? "?",
        resultsPosted: d.hasResults,
        keyResult: primary ? `${primary.title}: ${primary.summary}` : d.hasResults ? "Results posted; no primary outcome values parsed" : "No results posted",
      };
    });
    const cmp: Comparison = { id: `K${this.comparisons.length + 1}`, sourceIds: trials.map((t) => t.id), rows };
    this.comparisons.push(cmp);
    return cmp;
  }

  findingExists(id: string) {
    return this.findings.some((f) => f.id === id);
  }

  toEvidenceFile(): EvidenceFile {
    return {
      findings: this.findings,
      gaps: this.gaps,
      clusters: this.clusters(),
      comparisons: this.comparisons,
      plan: this.plan,
      entities: this.entities,
      structure: this.structure,
      searches: this.searches,
    };
  }

  toSourcesFile() {
    return { sources: [...this.sources.values()] };
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

function dedupeIds(list: Identifiers[]): Identifiers[] {
  const seen = new Set<string>();
  return list.filter((i) => {
    const k = JSON.stringify(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
