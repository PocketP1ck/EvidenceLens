import { fetchJson, nowIso } from "./http";
import { clip, type SourceRecord } from "./types";

const RCSB_SEARCH = "https://search.rcsb.org/rcsbsearch/v2/query";
const RCSB_GRAPHQL = "https://data.rcsb.org/graphql";
const AF_API = "https://alphafold.ebi.ac.uk/api/prediction";

const ANTIBODY_RE = /\b(fab|fv|scfv|antibody|nanobody|vhh|heavy[- ]chain|light[- ]chain|immunoglobulin)\b/i;
const AID_RE = /crystalli[sz]ation aid/i;

export interface PdbEntity {
  description: string;
  uniprotIds: string[];
  chains: string[];
}
export interface PdbEntry {
  pdbId: string;
  title: string;
  method?: string;
  resolution?: number;
  releaseDate?: string;
  entities: PdbEntity[];
}

export interface StructureChoice {
  type: "experimental" | "predicted";
  /** Source record ID (pdb:XXXX or alphafold:AF-...). */
  sourceId: string;
  modelId: string;
  title: string;
  fileUrl: string;
  format: "cif" | "pdb";
  targetChains: string[];
  partnerChains: { label: string; chains: string[]; role: "intervention" | "other" }[];
  method?: string;
  resolution?: number;
  /** AlphaFold only. */
  meanPlddt?: number;
  plddtBands?: { veryHigh: number; confident: number; low: number; veryLow: number };
  version?: number;
  paeImageUrl?: string;
  identity: { uniprotAccession: string; verified: boolean; method: string };
  reason: string;
}

export interface StructureResult {
  choice: StructureChoice | null;
  records: SourceRecord[];
  considered: { pdbId: string; title: string; resolution?: number; matchedIntervention: boolean }[];
  notes: string[];
}

export async function searchPdbByUniprot(accession: string): Promise<string[]> {
  const res = await fetchJson<{ result_set?: { identifier: string }[] }>("RCSB PDB", RCSB_SEARCH, {
    method: "POST",
    body: {
      query: {
        type: "terminal",
        service: "text",
        parameters: {
          attribute: "rcsb_polymer_entity_container_identifiers.reference_sequence_identifiers.database_accession",
          operator: "exact_match",
          value: accession,
        },
      },
      return_type: "entry",
      request_options: { paginate: { start: 0, rows: 100 } },
    },
  });
  return (res?.result_set ?? []).map((r) => r.identifier);
}

interface GqlEntry {
  rcsb_id: string;
  struct?: { title?: string };
  rcsb_entry_info?: { resolution_combined?: number[] | null; experimental_method?: string };
  rcsb_accession_info?: { initial_release_date?: string };
  polymer_entities?: {
    rcsb_polymer_entity?: { pdbx_description?: string | null };
    rcsb_polymer_entity_container_identifiers?: { auth_asym_ids?: string[] | null; uniprot_ids?: string[] | null };
  }[];
}

export function normalizePdbEntries(entries: GqlEntry[]): PdbEntry[] {
  return entries.map((e) => ({
    pdbId: e.rcsb_id,
    title: e.struct?.title ?? e.rcsb_id,
    method: e.rcsb_entry_info?.experimental_method,
    resolution: e.rcsb_entry_info?.resolution_combined?.[0] ?? undefined,
    releaseDate: e.rcsb_accession_info?.initial_release_date?.slice(0, 10),
    entities: (e.polymer_entities ?? []).map((p) => ({
      description: p.rcsb_polymer_entity?.pdbx_description ?? "",
      uniprotIds: p.rcsb_polymer_entity_container_identifiers?.uniprot_ids ?? [],
      chains: p.rcsb_polymer_entity_container_identifiers?.auth_asym_ids ?? [],
    })),
  }));
}

export async function getPdbEntries(ids: string[]): Promise<PdbEntry[]> {
  if (!ids.length) return [];
  const query = `query E($ids: [String!]!) { entries(entry_ids: $ids) { rcsb_id struct { title } rcsb_entry_info { resolution_combined experimental_method } rcsb_accession_info { initial_release_date } polymer_entities { rcsb_polymer_entity { pdbx_description } rcsb_polymer_entity_container_identifiers { auth_asym_ids uniprot_ids } } } }`;
  const res = await fetchJson<{ data?: { entries?: GqlEntry[] } }>("RCSB PDB", RCSB_GRAPHQL, { method: "POST", body: { query, variables: { ids: ids.slice(0, 100) } } });
  return normalizePdbEntries(res?.data?.entries ?? []);
}

function describeOther(e: PdbEntity) {
  if (AID_RE.test(e.description)) return e.description;
  if (e.uniprotIds.length) return `${e.description} (UniProt ${e.uniprotIds.join(",")})`;
  return ANTIBODY_RE.test(e.description) ? `${e.description} (antibody fragment)` : e.description || "Other entity";
}

function matchesName(text: string, names: string[]) {
  const t = text.toLowerCase();
  return names.some((n) => n.length >= 4 && t.includes(n.toLowerCase()));
}

/**
 * Pick the experimental entry that shows the intervention bound to the target.
 * The target chain must map to the accession (SIFTS UniProt mapping) and the
 * intervention must be named in an entity description or the entry title.
 */
export function pickExperimental(entries: PdbEntry[], accession: string, interventionNames: string[]): { entry: PdbEntry; choice: Omit<StructureChoice, "sourceId" | "reason"> } | null {
  const scored = entries
    .map((entry) => {
      const targetEntities = entry.entities.filter((e) => e.uniprotIds.includes(accession));
      if (!targetEntities.length) return null;
      const drugEntities = entry.entities.filter((e) => !e.uniprotIds.includes(accession) && matchesName(e.description, interventionNames));
      const titleMatch = matchesName(entry.title, interventionNames);
      if (!drugEntities.length && !titleMatch) return null;
      return { entry, targetEntities, drugEntities };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => b.drugEntities.length - a.drugEntities.length || (a.entry.resolution ?? 99) - (b.entry.resolution ?? 99));
  const best = scored[0];
  if (!best) return null;
  const { entry, targetEntities, drugEntities } = best;
  const others = entry.entities.filter((e) => !targetEntities.includes(e) && !drugEntities.includes(e));
  return {
    entry,
    choice: {
      type: "experimental",
      modelId: entry.pdbId,
      title: entry.title,
      fileUrl: `https://files.rcsb.org/download/${entry.pdbId}.cif`,
      format: "cif",
      targetChains: targetEntities.flatMap((e) => e.chains),
      partnerChains: [
        ...drugEntities.map((e) => ({ label: e.description, chains: e.chains, role: "intervention" as const })),
        ...others.map((e) => ({ label: describeOther(e), chains: e.chains, role: "other" as const })),
      ],
      method: entry.method,
      resolution: entry.resolution,
      identity: { uniprotAccession: accession, verified: true, method: "RCSB/SIFTS UniProt mapping of the target entity" },
    },
  };
}

interface AfEntry {
  entryId: string;
  uniprotAccession: string;
  gene?: string;
  uniprotDescription?: string;
  isUniProtReviewed?: boolean;
  globalMetricValue?: number;
  fractionPlddtVeryHigh?: number;
  fractionPlddtConfident?: number;
  fractionPlddtLow?: number;
  fractionPlddtVeryLow?: number;
  latestVersion?: number;
  pdbUrl: string;
  cifUrl?: string;
  paeImageUrl?: string;
  sequence?: string;
  uniprotSequence?: string;
  toolUsed?: string;
  isComplex?: boolean;
}

export function pickAlphaFold(entries: AfEntry[], accession: string, uniprotSequence?: string): Omit<StructureChoice, "reason"> | null {
  const candidates = entries.filter((e) => e.uniprotAccession === accession && !e.isComplex);
  const exact = candidates.find((e) => uniprotSequence && e.sequence === uniprotSequence);
  const af = exact ?? candidates[0];
  if (!af) return null;
  const verified = Boolean(uniprotSequence && af.sequence === uniprotSequence);
  return {
    type: "predicted",
    sourceId: `alphafold:${af.entryId}`,
    modelId: `${af.entryId} v${af.latestVersion ?? "?"}`,
    title: `AlphaFold prediction for ${af.uniprotDescription ?? accession} (${af.gene ?? accession})`,
    fileUrl: af.pdbUrl,
    format: "pdb",
    targetChains: ["A"],
    partnerChains: [],
    meanPlddt: af.globalMetricValue,
    plddtBands: {
      veryHigh: af.fractionPlddtVeryHigh ?? 0,
      confident: af.fractionPlddtConfident ?? 0,
      low: af.fractionPlddtLow ?? 0,
      veryLow: af.fractionPlddtVeryLow ?? 0,
    },
    version: af.latestVersion,
    paeImageUrl: af.paeImageUrl,
    identity: {
      uniprotAccession: accession,
      verified,
      method: verified ? "Model sequence identical to UniProt sequence" : uniprotSequence ? "Sequence MISMATCH with UniProt; residue positions may not map" : "UniProt sequence not supplied; identity unchecked",
    },
  };
}

function pdbRecord(entry: PdbEntry, retrievedAt: string): SourceRecord {
  const ents = entry.entities.map((e) => `${e.description || "entity"} [chains ${e.chains.join(",")}${e.uniprotIds.length ? `; UniProt ${e.uniprotIds.join(",")}` : ""}]`).join("; ");
  return {
    id: `pdb:${entry.pdbId}`,
    kind: "structure",
    source: "RCSB PDB",
    title: entry.title,
    url: `https://www.rcsb.org/structure/${entry.pdbId}`,
    retrievedAt,
    year: entry.releaseDate ? Number(entry.releaseDate.slice(0, 4)) : undefined,
    excerpt: clip(`${entry.method ?? "?"}${entry.resolution ? `, ${entry.resolution} Å` : ""}. Entities: ${ents}`, 600),
    text: `${entry.title}. ${ents}`,
    identifiers: {},
    linked: [],
    data: entry as unknown as Record<string, unknown>,
  };
}

function afRecord(c: Omit<StructureChoice, "reason">, retrievedAt: string): SourceRecord {
  const text = `${c.title}. Mean pLDDT ${c.meanPlddt ?? "?"}; fraction very high ${c.plddtBands?.veryHigh}, confident ${c.plddtBands?.confident}, low ${c.plddtBands?.low}, very low ${c.plddtBands?.veryLow}. pLDDT is local structural confidence, not evidence about disease relevance.`;
  return {
    id: c.sourceId,
    kind: "structure",
    source: "AlphaFold DB",
    title: c.title,
    url: `https://alphafold.ebi.ac.uk/entry/${c.identity.uniprotAccession}`,
    retrievedAt,
    excerpt: text,
    text,
    identifiers: {},
    linked: [],
    data: c as unknown as Record<string, unknown>,
  };
}

/**
 * Structure selection, in order:
 * 1. Experimental entry showing the named intervention bound to the target (UniProt-mapped chain).
 * 2. AlphaFold model of the target with sequence identity checked against UniProt.
 * 3. Nothing — the caller records the gap. We never substitute an unrelated molecule.
 */
export async function findStructure(input: { uniprotAccession: string; interventionNames?: string[]; uniprotSequence?: string }): Promise<StructureResult> {
  const { uniprotAccession: acc, interventionNames = [], uniprotSequence } = input;
  if (!/^[A-Z0-9]{6,10}$/.test(acc)) throw new Error(`Invalid UniProt accession: ${acc}`);
  const retrievedAt = nowIso();
  const notes: string[] = [];
  const records: SourceRecord[] = [];

  let entries: PdbEntry[] = [];
  try {
    entries = await getPdbEntries(await searchPdbByUniprot(acc));
  } catch (err) {
    notes.push(`RCSB PDB lookup failed: ${(err as Error).message}`);
  }
  const considered = entries.map((e) => ({
    pdbId: e.pdbId,
    title: e.title,
    resolution: e.resolution,
    matchedIntervention: matchesName(e.title + " " + e.entities.map((x) => x.description).join(" "), interventionNames),
  }));

  if (interventionNames.length) {
    const exp = pickExperimental(entries, acc, interventionNames);
    if (exp) {
      records.push(pdbRecord(exp.entry, retrievedAt));
      return {
        choice: {
          ...exp.choice,
          sourceId: `pdb:${exp.entry.pdbId}`,
          reason: `Experimental structure of ${interventionNames.join("/")} bound to the target (${entries.length} PDB entries map to ${acc}).`,
        },
        records,
        considered,
        notes,
      };
    }
    notes.push(`No PDB entry among ${entries.length} mapped to ${acc} names ${interventionNames.join("/")}; related complexes were not substituted.`);
  }

  try {
    const af = await fetchJson<AfEntry[]>("AlphaFold DB", `${AF_API}/${acc}`);
    const choice = pickAlphaFold(af ?? [], acc, uniprotSequence);
    if (choice) {
      records.push(afRecord(choice, retrievedAt));
      return {
        choice: { ...choice, reason: interventionNames.length ? "Predicted model of the target; no experimental complex with the intervention was found." : "Predicted model of the target." },
        records,
        considered,
        notes,
      };
    }
    notes.push(`AlphaFold DB has no model for ${acc}.`);
  } catch (err) {
    notes.push(`AlphaFold DB lookup failed: ${(err as Error).message}`);
  }
  return { choice: null, records, considered, notes };
}
