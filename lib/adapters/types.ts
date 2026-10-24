export type SourceKind = "trial" | "publication" | "association" | "protein" | "compound" | "structure";

export type SourceName =
  | "ClinicalTrials.gov"
  | "Europe PMC"
  | "Open Targets"
  | "UniProt"
  | "ChEMBL"
  | "AlphaFold DB"
  | "RCSB PDB";

export interface Identifiers {
  pmid?: string;
  pmcid?: string;
  nct?: string;
  doi?: string;
}

/**
 * A record retrieved from a public source. Only adapters create these;
 * the model can cite them by `id` but never invent them.
 */
export interface SourceRecord {
  id: string;
  kind: SourceKind;
  source: SourceName;
  title: string;
  url: string;
  retrievedAt: string;
  year?: number;
  /** Short excerpt shown to the model and in the report. */
  excerpt: string;
  /** Fuller retrieved text used to verify quoted passages. */
  text: string;
  identifiers: Identifiers;
  /** Identifiers of records reporting the same study (e.g. a trial's results publication). */
  linked: Identifiers[];
  data: Record<string, unknown>;
}

export class AdapterError extends Error {
  constructor(
    readonly source: SourceName,
    message: string,
    readonly status?: number,
  ) {
    super(`${source}: ${message}`);
    this.name = "AdapterError";
  }
}

export const NCT_RE = /\bNCT\d{8}\b/g;

export function uniqueNcts(text: string): string[] {
  return [...new Set(text.match(NCT_RE) ?? [])];
}

export function clip(text: string | undefined | null, max: number): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

export function stripTags(html: string | undefined | null): string {
  return (html ?? "").replace(/<[^>]+>/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
