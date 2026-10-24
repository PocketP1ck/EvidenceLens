import type { SourceRecord } from "@/lib/adapters/types";
import type { Brief, EvidenceFile } from "@/lib/harness/types";
import type { RunStore } from "@/lib/harness/store";
import { evidenceMapSvg } from "./evidence-map";
import { timelineSvg } from "./timeline";

export { evidenceMapSvg } from "./evidence-map";
export { timelineSvg } from "./timeline";

/** Write the code-generated figures into figures/. The 3D figure is captured in the browser. */
export async function writeFigures(store: RunStore, brief: Brief, evidence: EvidenceFile, sources: SourceRecord[]) {
  await store.saveFile("figures", "evidence-map.svg", evidenceMapSvg(brief, evidence, sources));
  await store.saveFile("figures", "timeline.svg", timelineSvg(evidence, sources));
}
