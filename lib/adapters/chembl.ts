import { fetchJson, nowIso } from "./http";
import { clip, type SourceRecord } from "./types";

const BASE = "https://www.ebi.ac.uk/chembl/api/data";

interface Molecule {
  molecule_chembl_id: string;
  pref_name?: string | null;
  molecule_type?: string;
  max_phase?: string | number | null;
  first_approval?: number | null;
}
interface Mechanism { mechanism_of_action?: string; action_type?: string; target_chembl_id?: string }
interface Indication { efo_term?: string; efo_id?: string; mesh_heading?: string; max_phase_for_ind?: string | number }
interface Target { target_chembl_id: string; pref_name?: string; target_type?: string; target_components?: { accession?: string; component_type?: string }[] }
interface Activity {
  standard_type?: string; standard_relation?: string; standard_value?: string; standard_units?: string;
  assay_type?: string; assay_chembl_id?: string; target_chembl_id?: string; target_pref_name?: string;
  document_chembl_id?: string; assay_description?: string;
}

export interface CompoundData {
  chemblId: string;
  name?: string;
  moleculeType?: string;
  maxPhase: number | null;
  firstApproval?: number | null;
  mechanisms: { action: string; actionType?: string; targetChemblId?: string; targetName?: string; targetType?: string; targetUniprot: string[] }[];
  indications: { term: string; efoId?: string; maxPhaseForIndication: number | null }[];
  /** Small molecules only. Assay type and units are kept; binding ≠ cellular activity ≠ clinical benefit. */
  activities: { type?: string; relation?: string; value?: string; units?: string; assayType?: string; assayId?: string; target?: string }[];
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

const ASSAY_TYPE: Record<string, string> = { B: "binding", F: "functional", A: "ADME", T: "toxicity", P: "physicochemical", U: "unclassified" };

export async function searchCompound(query: string): Promise<SourceRecord[]> {
  const params = new URLSearchParams({ q: query, limit: "3" });
  const res = await fetchJson<{ molecules?: Molecule[] }>("ChEMBL", `${BASE}/molecule/search.json?${params}`, { timeoutMs: 40_000 });
  const molecules = res?.molecules ?? [];
  // Only the best match is expanded to keep calls bounded.
  return molecules.length ? [await expandMolecule(molecules[0])] : [];
}

export async function expandMolecule(m: Molecule): Promise<SourceRecord> {
  const id = m.molecule_chembl_id;
  const [mech, ind] = await Promise.all([
    fetchJson<{ mechanisms?: Mechanism[] }>("ChEMBL", `${BASE}/mechanism.json?molecule_chembl_id=${id}`, { timeoutMs: 40_000 }),
    fetchJson<{ drug_indications?: Indication[] }>("ChEMBL", `${BASE}/drug_indication.json?molecule_chembl_id=${id}&limit=100`, { timeoutMs: 40_000 }),
  ]);
  const targetIds = [...new Set((mech?.mechanisms ?? []).map((x) => x.target_chembl_id).filter((x): x is string => Boolean(x)))];
  const targets = new Map<string, Target>();
  await Promise.all(
    targetIds.slice(0, 3).map(async (tid) => {
      const t = await fetchJson<Target>("ChEMBL", `${BASE}/target/${tid}.json`, { timeoutMs: 40_000 }).catch(() => null);
      if (t) targets.set(tid, t);
    }),
  );
  let activities: CompoundData["activities"] = [];
  if (m.molecule_type === "Small molecule") {
    const act = await fetchJson<{ activities?: Activity[] }>("ChEMBL", `${BASE}/activity.json?molecule_chembl_id=${id}&limit=10`, { timeoutMs: 40_000 }).catch(() => null);
    activities = (act?.activities ?? []).map((a) => ({
      type: a.standard_type,
      relation: a.standard_relation,
      value: a.standard_value,
      units: a.standard_units,
      assayType: a.assay_type ? (ASSAY_TYPE[a.assay_type] ?? a.assay_type) : undefined,
      assayId: a.assay_chembl_id,
      target: a.target_pref_name,
    }));
  }
  return normalizeCompound(m, mech?.mechanisms ?? [], ind?.drug_indications ?? [], targets, activities);
}

export function normalizeCompound(
  m: Molecule,
  mechanisms: Mechanism[],
  indications: Indication[],
  targets: Map<string, Target>,
  activities: CompoundData["activities"] = [],
  retrievedAt = nowIso(),
): SourceRecord {
  const data: CompoundData = {
    chemblId: m.molecule_chembl_id,
    name: m.pref_name ?? undefined,
    moleculeType: m.molecule_type,
    maxPhase: num(m.max_phase),
    firstApproval: m.first_approval,
    mechanisms: mechanisms.map((x) => {
      const t = x.target_chembl_id ? targets.get(x.target_chembl_id) : undefined;
      return {
        action: x.mechanism_of_action ?? "unknown",
        actionType: x.action_type,
        targetChemblId: x.target_chembl_id,
        targetName: t?.pref_name,
        targetType: t?.target_type,
        targetUniprot: (t?.target_components ?? []).map((c) => c.accession).filter((a): a is string => Boolean(a)),
      };
    }),
    indications: indications
      .map((i) => ({ term: i.efo_term ?? i.mesh_heading ?? "?", efoId: i.efo_id, maxPhaseForIndication: num(i.max_phase_for_ind) }))
      .sort((a, b) => (b.maxPhaseForIndication ?? 0) - (a.maxPhaseForIndication ?? 0)),
    activities,
  };
  const mechText = data.mechanisms.map((x) => `${x.action} (${x.actionType ?? "?"}; target ${x.targetName ?? x.targetChemblId ?? "?"} ${x.targetUniprot.join(",")})`).join("; ");
  const indText = data.indications.map((i) => `${i.term}: max phase ${i.maxPhaseForIndication ?? "?"}`).join("; ");
  return {
    id: `chembl:${data.chemblId}`,
    kind: "compound",
    source: "ChEMBL",
    title: `${data.name ?? data.chemblId} (${data.moleculeType ?? "compound"})`,
    url: `https://www.ebi.ac.uk/chembl/explore/compound/${data.chemblId}`,
    retrievedAt,
    excerpt: clip(`Max phase ${data.maxPhase ?? "?"}${data.firstApproval ? `, first approval ${data.firstApproval}` : ""}. Mechanism: ${mechText || "none recorded"}. Indications: ${indText || "none recorded"}.`, 900),
    text: `Mechanism: ${mechText}. Indications: ${indText}.`,
    identifiers: {},
    linked: [],
    data: data as unknown as Record<string, unknown>,
  };
}
