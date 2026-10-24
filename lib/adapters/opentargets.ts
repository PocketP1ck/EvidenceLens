import { fetchJson, nowIso } from "./http";
import { clip, type SourceRecord } from "./types";

const ENDPOINT = "https://api.platform.opentargets.org/api/v4/graphql";

export interface OtHit {
  id: string;
  name: string;
  entity: string;
  description?: string;
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetchJson<{ data?: T; errors?: { message: string }[] }>("Open Targets", ENDPOINT, {
    method: "POST",
    body: { query, variables },
  });
  if (res?.errors?.length) throw new Error(`Open Targets: ${res.errors.map((e) => e.message).join("; ")}`);
  if (!res?.data) throw new Error("Open Targets: empty response");
  return res.data;
}

const SEARCH = `query Search($q: String!, $e: [String!]!) { search(queryString: $q, entityNames: $e, page: {index: 0, size: 3}) { hits { id name entity description } } }`;

export async function searchEntity(query: string, entity: "target" | "disease"): Promise<OtHit[]> {
  const data = await gql<{ search: { hits: OtHit[] } }>(SEARCH, { q: query, e: [entity] });
  return data.search.hits.map((h) => ({ ...h, description: clip(h.description, 240) }));
}

const ASSOC = `query Assoc($t: String!, $d: String!) { target(ensemblId: $t) { id approvedSymbol approvedName proteinIds { id source } associatedDiseases(Bs: [$d]) { count rows { disease { id name } score datatypeScores { id score } } } } disease(efoId: $d) { id name } }`;

interface AssocData {
  target: {
    id: string;
    approvedSymbol: string;
    approvedName: string;
    proteinIds: { id: string; source: string }[];
    associatedDiseases: { count: number; rows: { disease: { id: string; name: string }; score: number; datatypeScores: { id: string; score: number }[] }[] };
  } | null;
  disease: { id: string; name: string } | null;
}

export interface AssociationData {
  ensemblId: string;
  symbol: string;
  diseaseId: string;
  diseaseName: string;
  /** Open Targets overall association score (0–1). A ranking signal, NOT a probability of therapeutic success. */
  associationScore: number | null;
  datatypeScores: { datatype: string; score: number }[];
  uniprotAccession?: string;
  scoreNote: string;
}

export function normalizeAssociation(data: AssocData, retrievedAt = nowIso()): SourceRecord {
  if (!data.target) throw new Error("Open Targets: unknown target");
  if (!data.disease) throw new Error("Open Targets: unknown disease");
  const row = data.target.associatedDiseases.rows[0];
  const swissprot = data.target.proteinIds.find((p) => p.source === "uniprot_swissprot")?.id;
  const assoc: AssociationData = {
    ensemblId: data.target.id,
    symbol: data.target.approvedSymbol,
    diseaseId: data.disease.id,
    diseaseName: data.disease.name,
    associationScore: row ? Math.round(row.score * 1000) / 1000 : null,
    datatypeScores: (row?.datatypeScores ?? [])
      .map((d) => ({ datatype: d.id, score: Math.round(d.score * 1000) / 1000 }))
      .sort((a, b) => b.score - a.score),
    uniprotAccession: swissprot,
    scoreNote: "Open Targets association scores rank target–disease evidence; they are not probabilities of therapeutic success.",
  };
  const scoreText = row
    ? `Overall association score ${assoc.associationScore} (datatypes: ${assoc.datatypeScores.map((d) => `${d.datatype} ${d.score}`).join(", ")}).`
    : "No direct target–disease association row was returned.";
  return {
    id: `ot:${assoc.ensemblId}:${assoc.diseaseId}`,
    kind: "association",
    source: "Open Targets",
    title: `${assoc.symbol} – ${assoc.diseaseName} association`,
    url: `https://platform.opentargets.org/evidence/${assoc.ensemblId}/${assoc.diseaseId}`,
    retrievedAt,
    excerpt: `${scoreText} ${assoc.scoreNote}`,
    text: `${scoreText} ${assoc.scoreNote}`,
    identifiers: {},
    linked: [],
    data: assoc as unknown as Record<string, unknown>,
  };
}

export async function getAssociation(ensemblId: string, diseaseId: string): Promise<SourceRecord> {
  if (!/^ENSG\d{11}$/.test(ensemblId)) throw new Error(`Invalid Ensembl gene ID: ${ensemblId}`);
  if (!/^[A-Za-z]+_\d+$/.test(diseaseId)) throw new Error(`Invalid disease ID: ${diseaseId} (expected e.g. MONDO_0005011)`);
  return normalizeAssociation(await gql<AssocData>(ASSOC, { t: ensemblId, d: diseaseId }));
}
