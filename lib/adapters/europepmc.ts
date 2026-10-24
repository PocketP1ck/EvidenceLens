import { fetchJson, nowIso } from "./http";
import { clip, stripTags, uniqueNcts, type SourceRecord } from "./types";

const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";

interface EpmcResult {
  id: string;
  source: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title: string;
  authorString?: string;
  journalInfo?: { journal?: { title?: string; isoabbreviation?: string } };
  pubYear?: string;
  abstractText?: string;
  pubTypeList?: { pubType?: string[] };
  isOpenAccess?: string;
  citedByCount?: number;
}

export interface LiteratureSearchInput {
  /** Every term must appear in the title or abstract. */
  terms: string[];
  /** Optional raw Europe PMC query clause ANDed with the terms, e.g. PUB_TYPE:"Randomized Controlled Trial". */
  extra?: string;
  sort?: "relevance" | "cited" | "recent";
  max?: number;
}

function quoteTerm(t: string) {
  const clean = t.replace(/["()]/g, " ").trim();
  // Allow a trailing wildcard (e.g. crohn*) unquoted; quote multi-word phrases.
  if (/^\w+\*$/.test(clean)) return clean;
  return `"${clean}"`;
}

export function buildQuery(input: LiteratureSearchInput): string {
  const clauses = input.terms
    .filter((t) => t.trim())
    .map((t) => {
      const q = quoteTerm(t);
      return `(TITLE:${q} OR ABSTRACT:${q})`;
    });
  if (input.extra?.trim()) clauses.push(`(${input.extra.trim()})`);
  return clauses.join(" AND ");
}

export function normalizePublication(r: EpmcResult, retrievedAt = nowIso()): SourceRecord {
  const abstract = stripTags(r.abstractText).replace(/\s+/g, " ").trim();
  const title = stripTags(r.title).replace(/\s+/g, " ").trim();
  const pmid = r.pmid ?? (r.source === "MED" ? r.id : undefined);
  const id = pmid ? `pmid:${pmid}` : r.pmcid ? `pmcid:${r.pmcid}` : `epmc:${r.source}:${r.id}`;
  const url = pmid
    ? `https://europepmc.org/article/MED/${pmid}`
    : r.pmcid
      ? `https://europepmc.org/article/PMC/${r.pmcid}`
      : `https://europepmc.org/article/${r.source}/${r.id}`;
  const year = r.pubYear ? Number(r.pubYear) : undefined;
  return {
    id,
    kind: "publication",
    source: "Europe PMC",
    title,
    url,
    retrievedAt,
    year: Number.isFinite(year) ? year : undefined,
    excerpt: clip(abstract || "(no abstract available)", 900),
    text: `${title}\n${abstract}`,
    identifiers: { pmid, pmcid: r.pmcid, doi: r.doi?.toLowerCase() },
    linked: uniqueNcts(abstract).map((nct) => ({ nct })),
    data: {
      journal: r.journalInfo?.journal?.isoabbreviation ?? r.journalInfo?.journal?.title,
      authors: clip(r.authorString, 160),
      pubTypes: r.pubTypeList?.pubType ?? [],
      citedByCount: r.citedByCount ?? 0,
      openAccess: r.isOpenAccess === "Y",
      hasAbstract: Boolean(abstract),
    },
  };
}

const SORT: Record<NonNullable<LiteratureSearchInput["sort"]>, string | undefined> = {
  relevance: undefined,
  cited: "CITED desc",
  recent: "P_PDATE_D desc",
};

export async function searchLiterature(input: LiteratureSearchInput): Promise<{ query: string; hitCount: number; records: SourceRecord[] }> {
  const query = buildQuery(input);
  if (!query) throw new Error("At least one search term is required");
  const params = new URLSearchParams({
    query,
    format: "json",
    resultType: "core",
    pageSize: String(Math.min(Math.max(input.max ?? 8, 1), 15)),
  });
  const sort = SORT[input.sort ?? "relevance"];
  if (sort) params.set("sort", sort);
  const res = await fetchJson<{ hitCount?: number; resultList?: { result?: EpmcResult[] } }>("Europe PMC", `${BASE}/search?${params}`);
  const retrievedAt = nowIso();
  return {
    query,
    hitCount: res?.hitCount ?? 0,
    records: (res?.resultList?.result ?? []).map((r) => normalizePublication(r, retrievedAt)),
  };
}

export async function getPublication(pmid: string): Promise<SourceRecord> {
  if (!/^\d{1,9}$/.test(pmid)) throw new Error(`Invalid PMID: ${pmid}`);
  const params = new URLSearchParams({ query: `EXT_ID:${pmid} AND SRC:MED`, format: "json", resultType: "core", pageSize: "1" });
  const res = await fetchJson<{ resultList?: { result?: EpmcResult[] } }>("Europe PMC", `${BASE}/search?${params}`);
  const hit = res?.resultList?.result?.[0];
  if (!hit) throw new Error(`PMID ${pmid} not found in Europe PMC`);
  return normalizePublication(hit);
}
