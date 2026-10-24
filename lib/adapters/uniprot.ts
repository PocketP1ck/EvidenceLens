import { fetchJson, nowIso } from "./http";
import { clip, type SourceRecord } from "./types";

const BASE = "https://rest.uniprot.org/uniprotkb";

interface Evidence { evidenceCode: string; source?: string; id?: string }
interface UpEntry {
  entryType: string;
  primaryAccession: string;
  uniProtkbId?: string;
  organism?: { scientificName?: string; taxonId?: number };
  proteinDescription?: { recommendedName?: { fullName?: { value: string } } };
  genes?: { geneName?: { value: string } }[];
  comments?: { commentType: string; texts?: { value: string; evidences?: Evidence[] }[] }[];
  features?: { type: string; description?: string; location: { start: { value: number }; end: { value: number } }; evidences?: Evidence[] }[];
  sequence?: { value: string; length: number };
}

/** ECO:0000269 = experimental evidence used in manual assertion. */
const EXPERIMENTAL = "ECO:0000269";

export interface ProteinData {
  accession: string;
  gene?: string;
  name?: string;
  organism?: string;
  taxonId?: number;
  reviewed: boolean;
  length?: number;
  sequence?: string;
  functionText?: string;
  functionEvidence: { experimental: number; other: number };
  features: { type: string; count: number; withExperimentalEvidence: number }[];
  annotationNote: string;
}

export function normalizeProtein(e: UpEntry, retrievedAt = nowIso()): SourceRecord {
  const fn = e.comments?.find((c) => c.commentType === "FUNCTION")?.texts?.[0];
  const fnEvidence = fn?.evidences ?? [];
  const byType = new Map<string, { count: number; exp: number }>();
  for (const f of e.features ?? []) {
    const cur = byType.get(f.type) ?? { count: 0, exp: 0 };
    cur.count++;
    if (f.evidences?.some((ev) => ev.evidenceCode === EXPERIMENTAL)) cur.exp++;
    byType.set(f.type, cur);
  }
  const data: ProteinData = {
    accession: e.primaryAccession,
    gene: e.genes?.[0]?.geneName?.value,
    name: e.proteinDescription?.recommendedName?.fullName?.value,
    organism: e.organism?.scientificName,
    taxonId: e.organism?.taxonId,
    reviewed: e.entryType.includes("reviewed (Swiss-Prot)"),
    length: e.sequence?.length,
    sequence: e.sequence?.value,
    functionText: fn?.value,
    functionEvidence: {
      experimental: fnEvidence.filter((ev) => ev.evidenceCode === EXPERIMENTAL).length,
      other: fnEvidence.filter((ev) => ev.evidenceCode !== EXPERIMENTAL).length,
    },
    features: [...byType].map(([type, v]) => ({ type, count: v.count, withExperimentalEvidence: v.exp })),
    annotationNote: "A reviewed UniProt entry does not make every annotation experimentally demonstrated; evidence is per feature.",
  };
  const fnText = fn?.value ?? "";
  return {
    id: `uniprot:${data.accession}`,
    kind: "protein",
    source: "UniProt",
    title: `${data.name ?? data.accession} (${data.gene ?? "?"}, ${data.organism ?? "?"})`,
    url: `https://www.uniprot.org/uniprotkb/${data.accession}/entry`,
    retrievedAt,
    excerpt: clip(`${data.reviewed ? "Reviewed (Swiss-Prot)" : "Unreviewed (TrEMBL)"} entry, ${data.length ?? "?"} aa. Function: ${fnText}`, 700),
    text: fnText,
    identifiers: {},
    linked: [],
    data: data as unknown as Record<string, unknown>,
  };
}

export async function getProtein(accession: string): Promise<SourceRecord> {
  if (!/^[A-Z0-9]{6,10}$/.test(accession)) throw new Error(`Invalid UniProt accession: ${accession}`);
  const res = await fetchJson<UpEntry>("UniProt", `${BASE}/${accession}.json`);
  if (!res) throw new Error(`UniProt ${accession}: empty response`);
  return normalizeProtein(res);
}

/** Reviewed human entry for a gene symbol. Returns null when none exists. */
export async function findHumanAccession(gene: string): Promise<{ accession: string; name?: string } | null> {
  const q = `gene_exact:${gene.replace(/[^A-Za-z0-9-]/g, "")} AND organism_id:9606 AND reviewed:true`;
  const params = new URLSearchParams({ query: q, fields: "accession,gene_names,protein_name,length", format: "json", size: "3" });
  const res = await fetchJson<{ results?: UpEntry[] }>("UniProt", `${BASE}/search?${params}`);
  const hit = res?.results?.[0];
  return hit ? { accession: hit.primaryAccession, name: hit.proteinDescription?.recommendedName?.fullName?.value } : null;
}
