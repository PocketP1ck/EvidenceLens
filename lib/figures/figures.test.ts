import { describe, expect, it } from "vitest";
import { EvidenceLedger } from "@/lib/harness/ledger";
import { normalizeStudy } from "@/lib/adapters/clinicaltrials";
import { normalizePublication } from "@/lib/adapters/europepmc";
import { fixture } from "@/lib/adapters/testing";
import { evidenceMapSvg, layoutEvidenceMap, sourceGroups } from "./evidence-map";
import { timelineItems, timelineSvg } from "./timeline";

function ledger() {
  const l = new EvidenceLedger();
  l.register(normalizeStudy(fixture("ctgov-NCT00584740.json")));
  l.register(normalizeStudy(fixture("ctgov-NCT01009281.json")));
  l.register(normalizePublication(fixture<{ resultList: { result: never[] } }>("epmc-pmid-22595313.json").resultList.result[0]));
  l.addFinding({ claim: "Trial stopped for futility at interim analysis", direction: "opposes", outcome: "negative", kind: "interpretation", sourceIds: ["ctgov:NCT00584740"] });
  l.addFinding({ claim: "Paper concluded secukinumab was ineffective <in> Crohn's & had more AEs", direction: "opposes", outcome: "negative", kind: "interpretation", sourceIds: ["pmid:22595313"] });
  l.addFinding({ claim: "Extension enrolled 7 patients", direction: "context", outcome: "not_applicable", kind: "interpretation", sourceIds: ["ctgov:NCT01009281"] });
  return l;
}

const brief = { title: "IL-17A blockade in Crohn's disease", assessment: "opposed" as const };

describe("evidence map", () => {
  it("merges records of one study into a single source node", () => {
    const l = ledger();
    const groups = sourceGroups(l.toEvidenceFile(), [...l.sources.values()]);
    expect(groups).toHaveLength(1);
    expect(groups[0].findingIds).toEqual(["F1", "F2", "F3"]);
    expect(groups[0].label).toBe("NCT00584740 · one study");
    expect(groups[0].sub).toBe("+ NCT01009281, PMID 22595313");
  });

  it("places findings in non-overlapping direction columns", () => {
    const l = ledger();
    const L = layoutEvidenceMap(brief, l.toEvidenceFile(), [...l.sources.values()]);
    const boxes = L.findings;
    for (const a of boxes)
      for (const b of boxes)
        if (a !== b) expect(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y).toBe(true);
  });

  it("escapes text and carries data attributes for interaction", () => {
    const l = ledger();
    const svg = evidenceMapSvg(brief, l.toEvidenceFile(), [...l.sources.values()]);
    expect(svg).toContain("&lt;in&gt;");
    expect(svg).not.toContain("<in>");
    expect(svg).toContain('data-finding="F2"');
    expect(svg.startsWith("<svg")).toBe(true);
  });
});

describe("timeline", () => {
  it("lists cited trials with registered dates and publications by year", () => {
    const l = ledger();
    const items = timelineItems(l.toEvidenceFile(), [...l.sources.values()]);
    const rct = items.find((i) => i.label === "NCT00584740")!;
    expect(rct.start).toBeCloseTo(2008 + 7 / 12, 3);
    expect(rct.end).toBeCloseTo(2010 + 7 / 12, 3);
    expect(rct.direction).toBe("opposes");
    expect(items.find((i) => i.label === "PMID 22595313")?.kind).toBe("publication");
    expect(timelineSvg(l.toEvidenceFile(), [...l.sources.values()])).toContain("NCT00584740");
  });
});
