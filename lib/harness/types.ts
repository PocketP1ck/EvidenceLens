import type { SourceRecord } from "@/lib/adapters/types";
import type { StructureChoice } from "@/lib/adapters/structures";
import type { UsageTotals } from "./budget";

export type Stage = "planning" | "searching" | "reading" | "comparing" | "writing" | "finished";

export type Direction = "supports" | "opposes" | "context";
export type Outcome = "positive" | "negative" | "null" | "not_posted" | "not_applicable";
export type FindingKind = "observation" | "interpretation" | "hypothesis";

export interface Finding {
  id: string;
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
  /** Distinct studies among cited sources, computed from identifier clusters. */
  independentStudies: number;
  recordedAt: string;
}

export interface Gap {
  id: string;
  description: string;
  attempted: string;
  recordedAt: string;
}

export interface Cluster {
  id: string;
  label: string;
  sourceIds: string[];
  sharedIdentifiers: string[];
}

export interface Comparison {
  id: string;
  sourceIds: string[];
  rows: ComparisonRow[];
}

export interface ComparisonRow {
  sourceId: string;
  label: string;
  year?: number;
  design: string;
  phase: string;
  population: string;
  enrollment?: number;
  status: string;
  primaryEndpoint: string;
  resultsPosted: boolean;
  keyResult: string;
}

export interface PlanStep {
  title: string;
  status: "pending" | "in_progress" | "done";
}

export interface BriefItem {
  text: string;
  findingIds: string[];
}

export type Assessment = "supported" | "opposed" | "mixed" | "insufficient";

export interface Brief {
  title: string;
  question: string;
  assessment: Assessment;
  summary: BriefItem;
  keyFindings: BriefItem[];
  opposingEvidence: BriefItem[];
  contextDifferences: BriefItem[];
  limitations: string[];
  unknowns: string[];
  nextQuestions: string[];
}

export interface EvidenceFile {
  findings: Finding[];
  gaps: Gap[];
  clusters: Cluster[];
  comparisons: Comparison[];
  plan: PlanStep[];
  entities: Entities;
  structure: StructureChoice | null;
  searches: SearchLog[];
}

export interface SearchLog {
  tool: string;
  intent: "support" | "counter" | "context";
  query: string;
  resultCount: number;
  at: string;
}

export interface Entities {
  target?: { symbol: string; ensemblId: string; uniprot?: string; name?: string };
  disease?: { id: string; name: string };
  compound?: { name: string; chemblId?: string };
}

export interface SourcesFile {
  sources: SourceRecord[];
}

export type RunStatus = "running" | "completed" | "stopped" | "failed";

export interface RunMeta {
  id: string;
  goal: string;
  context: { target?: string; disease?: string; compound?: string };
  model: string;
  status: RunStatus;
  createdAt: string;
  finishedAt?: string;
  stopReason?: string;
  steps: number;
  usage: UsageTotals;
  limits: { perRunCapUsd: number; maxSteps: number };
  assessment?: Assessment;
  title?: string;
}

type EventBase = { seq: number; at: string };
export type RunEvent = EventBase &
  (
    | { type: "run_started"; goal: string; model: string }
    | { type: "stage"; stage: Stage; label: string; tool: string; input?: unknown }
    | { type: "tool_result"; tool: string; ok: boolean; summary: string; sourceIds?: string[] }
    | { type: "finding"; findingId: string; direction: Direction; claim: string }
    | { type: "usage"; usd: number; runUsd: number }
    | { type: "notice"; message: string }
    | { type: "finished"; status: RunStatus; stopReason: string; title?: string; assessment?: Assessment; summary?: string }
  );

export type NewRunEvent = RunEvent extends infer E ? (E extends RunEvent ? Omit<E, "seq" | "at"> : never) : never;
