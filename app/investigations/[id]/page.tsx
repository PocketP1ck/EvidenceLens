import { notFound } from "next/navigation";
import { INVESTIGATIONS_DIR } from "@/lib/config";
import { loadInvestigation, readEvents } from "@/lib/harness/store";
import { citationIndex } from "@/lib/harness/brief";
import { evidenceMapSvg, timelineSvg } from "@/lib/figures";
import { TopBar } from "@/components/Chrome";
import { ReportView, type LeanSource } from "@/components/report/ReportView";
import type { EvidenceFile } from "@/lib/harness/types";

export const dynamic = "force-dynamic";

const EMPTY: EvidenceFile = { findings: [], gaps: [], clusters: [], comparisons: [], plan: [], entities: {}, structure: null, searches: [] };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await loadInvestigation(INVESTIGATIONS_DIR, id);
  return { title: inv ? `${inv.brief?.title ?? inv.run.goal} · EvidenceLens` : "EvidenceLens" };
}

export default async function InvestigationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const inv = await loadInvestigation(INVESTIGATIONS_DIR, id);
  if (!inv) notFound();
  const evidence = inv.evidence ?? EMPTY;
  const sources = inv.sources?.sources ?? [];
  const index = inv.brief ? citationIndex(inv.brief, evidence.findings) : new Map<string, number>();
  // Strip bulky retrieved text before sending to the browser; keep trial data for the comparison view.
  const lean: LeanSource[] = sources.map(({ text: _text, data, ...rest }) => ({ ...rest, data: rest.kind === "trial" ? data : undefined }));
  const events = await readEvents(INVESTIGATIONS_DIR, id);
  return (
    <>
      <div className="atmosphere" aria-hidden="true" />
      <main className="shell">
        <TopBar note="Research folder" />
        <ReportView
          run={inv.run}
          brief={inv.brief}
          evidence={evidence}
          sources={lean}
          citeIndex={Object.fromEntries(index)}
          mapSvg={inv.brief ? evidenceMapSvg(inv.brief, evidence, sources) : ""}
          timelineSvg={timelineSvg(evidence, sources)}
          events={events}
          hasStructurePng={inv.figures.includes("structure.png")}
        />
      </main>
    </>
  );
}
