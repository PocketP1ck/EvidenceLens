import { fetchJson, nowIso } from "./http";
import { clip, type Identifiers, type SourceRecord } from "./types";

const BASE = "https://clinicaltrials.gov/api/v2";

/* Minimal shapes of the CT.gov v2 JSON we read. */
interface CtDate { date?: string }
interface CtStudy {
  protocolSection: {
    identificationModule: { nctId: string; briefTitle: string; officialTitle?: string; orgStudyIdInfo?: { id?: string } };
    statusModule: { overallStatus?: string; whyStopped?: string; startDateStruct?: CtDate; completionDateStruct?: CtDate & { type?: string }; resultsFirstPostDateStruct?: CtDate };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
    descriptionModule?: { briefSummary?: string };
    conditionsModule?: { conditions?: string[] };
    designModule?: {
      studyType?: string;
      phases?: string[];
      designInfo?: { allocation?: string; interventionModel?: string; primaryPurpose?: string; maskingInfo?: { masking?: string } };
      enrollmentInfo?: { count?: number; type?: string };
    };
    armsInterventionsModule?: {
      armGroups?: { label: string; type?: string; description?: string }[];
      interventions?: { type?: string; name: string; description?: string; otherNames?: string[] }[];
    };
    outcomesModule?: { primaryOutcomes?: { measure: string; timeFrame?: string; description?: string }[]; secondaryOutcomes?: { measure: string; timeFrame?: string }[] };
    eligibilityModule?: { eligibilityCriteria?: string; minimumAge?: string; maximumAge?: string; sex?: string };
    referencesModule?: { references?: { pmid?: string; type?: string; citation?: string }[] };
  };
  resultsSection?: {
    outcomeMeasuresModule?: { outcomeMeasures?: CtOutcome[] };
    adverseEventsModule?: { eventGroups?: { id: string; title: string; seriousNumAffected?: number; seriousNumAtRisk?: number; otherNumAffected?: number; otherNumAtRisk?: number }[] };
  };
  hasResults?: boolean;
}

interface CtOutcome {
  type?: string;
  title: string;
  description?: string;
  populationDescription?: string;
  unitOfMeasure?: string;
  paramType?: string;
  timeFrame?: string;
  groups?: { id: string; title: string }[];
  denoms?: { counts?: { groupId: string; value: string }[] }[];
  classes?: { title?: string; categories?: { title?: string; measurements?: { groupId: string; value?: string; spread?: string; lowerLimit?: string; upperLimit?: string }[] }[] }[];
  analyses?: { pValue?: string; statisticalMethod?: string; groupIds?: string[] }[];
}

export interface TrialOutcomeResult {
  type: string;
  title: string;
  timeFrame?: string;
  unit?: string;
  summary: string;
  pValues: string[];
}

export interface TrialData {
  nctId: string;
  orgStudyId?: string;
  status?: string;
  whyStopped?: string;
  phases: string[];
  studyType?: string;
  allocation?: string;
  masking?: string;
  enrollment?: number;
  enrollmentType?: string;
  startDate?: string;
  completionDate?: string;
  conditions: string[];
  interventions: string[];
  arms: string[];
  sponsor?: string;
  primaryOutcomes: string[];
  hasResults: boolean;
  results: TrialOutcomeResult[];
  adverseEvents: { group: string; serious: string; other: string }[];
  references: { pmid: string; type?: string; citation?: string }[];
  eligibility?: string;
}

function studyUrl(nct: string) {
  return `https://clinicaltrials.gov/study/${nct}`;
}

function yearOf(date?: string) {
  const y = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isFinite(y) ? y : undefined;
}

function summarizeOutcome(o: CtOutcome): TrialOutcomeResult {
  const groupTitle = new Map((o.groups ?? []).map((g) => [g.id, g.title]));
  const denom = new Map((o.denoms?.[0]?.counts ?? []).map((c) => [c.groupId, c.value]));
  const parts: string[] = [];
  for (const cls of o.classes ?? []) {
    for (const cat of cls.categories ?? []) {
      const label = [cls.title, cat.title].filter(Boolean).join(" / ");
      const values = (cat.measurements ?? []).map((m) => {
        const spread = m.spread ? ` ± ${m.spread}` : m.lowerLimit && m.upperLimit ? ` (${m.lowerLimit} to ${m.upperLimit})` : "";
        const n = denom.get(m.groupId);
        return `${groupTitle.get(m.groupId) ?? m.groupId}: ${m.value ?? "NA"}${spread}${n ? ` (n=${n})` : ""}`;
      });
      parts.push(`${label ? `${label}: ` : ""}${values.join("; ")}`);
    }
  }
  return {
    type: o.type ?? "OTHER",
    title: o.title,
    timeFrame: o.timeFrame,
    unit: o.unitOfMeasure,
    summary: clip(parts.join(" | "), 500),
    pValues: (o.analyses ?? []).map((a) => a.pValue).filter((p): p is string => Boolean(p)),
  };
}

export function normalizeStudy(study: CtStudy, retrievedAt = nowIso()): SourceRecord {
  const ps = study.protocolSection;
  const id = ps.identificationModule;
  const st = ps.statusModule;
  const design = ps.designModule ?? {};
  const arms = ps.armsInterventionsModule ?? {};
  const outcomes = study.resultsSection?.outcomeMeasuresModule?.outcomeMeasures ?? [];
  // Primary outcomes first, then up to three secondary outcomes.
  const results = [
    ...outcomes.filter((o) => o.type === "PRIMARY"),
    ...outcomes.filter((o) => o.type === "SECONDARY").slice(0, 3),
  ].map(summarizeOutcome);
  const ae = (study.resultsSection?.adverseEventsModule?.eventGroups ?? []).map((g) => ({
    group: g.title,
    serious: `${g.seriousNumAffected ?? "?"}/${g.seriousNumAtRisk ?? "?"}`,
    other: `${g.otherNumAffected ?? "?"}/${g.otherNumAtRisk ?? "?"}`,
  }));
  const references = (ps.referencesModule?.references ?? [])
    .filter((r): r is { pmid: string; type?: string; citation?: string } => Boolean(r.pmid))
    .map((r) => ({ pmid: r.pmid, type: r.type, citation: clip(r.citation, 300) }));

  const data: TrialData = {
    nctId: id.nctId,
    orgStudyId: id.orgStudyIdInfo?.id,
    status: st.overallStatus,
    whyStopped: st.whyStopped,
    phases: design.phases ?? [],
    studyType: design.studyType,
    allocation: design.designInfo?.allocation,
    masking: design.designInfo?.maskingInfo?.masking,
    enrollment: design.enrollmentInfo?.count,
    enrollmentType: design.enrollmentInfo?.type,
    startDate: st.startDateStruct?.date,
    completionDate: st.completionDateStruct?.date,
    conditions: ps.conditionsModule?.conditions ?? [],
    interventions: (arms.interventions ?? []).map((i) => `${i.type ?? ""} ${i.name}${i.description ? ` (${clip(i.description, 80)})` : ""}`.trim()),
    arms: (arms.armGroups ?? []).map((a) => `${a.label}${a.type ? ` [${a.type}]` : ""}${a.description ? `: ${clip(a.description, 140)}` : ""}`),
    sponsor: ps.sponsorCollaboratorsModule?.leadSponsor?.name,
    primaryOutcomes: (ps.outcomesModule?.primaryOutcomes ?? []).map((o) => `${o.measure}${o.timeFrame ? ` [${o.timeFrame}]` : ""}`),
    hasResults: Boolean(study.hasResults),
    results,
    adverseEvents: ae,
    references,
    eligibility: clip(ps.eligibilityModule?.eligibilityCriteria, 600),
  };

  const textParts = [
    id.briefTitle,
    id.officialTitle,
    ps.descriptionModule?.briefSummary,
    st.whyStopped ? `Why stopped: ${st.whyStopped}` : "",
    ...data.primaryOutcomes.map((o) => `Primary outcome: ${o}`),
    ...results.map((r) => `${r.type} result: ${r.title}. ${r.summary}`),
    ...ae.map((a) => `Adverse events ${a.group}: serious ${a.serious}, other ${a.other}`),
    ps.eligibilityModule?.eligibilityCriteria,
  ];

  const linked: Identifiers[] = references.map((r) => ({ pmid: r.pmid }));
  const phase = data.phases.join("/") || "NA";
  return {
    id: `ctgov:${id.nctId}`,
    kind: "trial",
    source: "ClinicalTrials.gov",
    title: id.briefTitle,
    url: studyUrl(id.nctId),
    retrievedAt,
    year: yearOf(data.startDate),
    excerpt: clip(
      `${phase} ${data.allocation ?? ""} ${data.studyType ?? ""} study, status ${data.status ?? "unknown"}${data.whyStopped ? ` (why stopped: ${data.whyStopped})` : ""}; enrollment ${data.enrollment ?? "?"}; results posted: ${data.hasResults ? "yes" : "no"}. ${ps.descriptionModule?.briefSummary ?? ""}`,
      600,
    ),
    text: textParts.filter(Boolean).join("\n").replace(/\s+/g, " "),
    identifiers: { nct: id.nctId },
    linked,
    data: data as unknown as Record<string, unknown>,
  };
}

export interface TrialSearchInput {
  condition?: string;
  intervention?: string;
  term?: string;
  max?: number;
}

export async function searchTrials(input: TrialSearchInput): Promise<SourceRecord[]> {
  const params = new URLSearchParams({ pageSize: String(Math.min(Math.max(input.max ?? 8, 1), 15)), format: "json" });
  if (input.condition) params.set("query.cond", input.condition);
  if (input.intervention) params.set("query.intr", input.intervention);
  if (input.term) params.set("query.term", input.term);
  const res = await fetchJson<{ studies?: CtStudy[] }>("ClinicalTrials.gov", `${BASE}/studies?${params}`);
  const retrievedAt = nowIso();
  return (res?.studies ?? []).map((s) => normalizeStudy(s, retrievedAt));
}

export async function getTrial(nctId: string): Promise<SourceRecord> {
  if (!/^NCT\d{8}$/.test(nctId)) throw new Error(`Invalid NCT ID: ${nctId}`);
  const res = await fetchJson<CtStudy>("ClinicalTrials.gov", `${BASE}/studies/${nctId}`);
  if (!res) throw new Error(`No record for ${nctId}`);
  return normalizeStudy(res);
}
