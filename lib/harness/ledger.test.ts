import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EvidenceLedger, LedgerError, passageFound } from "./ledger";
import { listInvestigations, loadInvestigation, makeRunId, readEvents, resolveRunFile, RunStore } from "./store";
import { normalizeStudy } from "@/lib/adapters/clinicaltrials";
import { normalizePublication } from "@/lib/adapters/europepmc";
import { fixture } from "@/lib/adapters/testing";
import { emptyTotals } from "./budget";

function seeded() {
  const l = new EvidenceLedger();
  l.register(normalizeStudy(fixture("ctgov-NCT00584740.json")));
  l.register(normalizeStudy(fixture("ctgov-NCT01009281.json")));
  const pub = fixture<{ resultList: { result: never[] } }>("epmc-pmid-22595313.json").resultList.result[0];
  l.register(normalizePublication(pub));
  return l;
}

describe("passage matching", () => {
  it("tolerates case, whitespace and unicode punctuation, and supports ellipses", () => {
    const src = "The study was terminated  prematurely after futility criterion was met — at planned interim analysis.";
    expect(passageFound("terminated prematurely after FUTILITY criterion", src)).toBe(true);
    expect(passageFound("terminated prematurely ... interim analysis", src)).toBe(true);
    expect(passageFound("terminated because of safety", src)).toBe(false);
  });
});

describe("EvidenceLedger", () => {
  it("clusters a trial registration with its results publication", () => {
    const l = seeded();
    const clusters = l.clusters();
    const c = clusters.find((x) => x.sourceIds.includes("pmid:22595313"));
    expect(c?.sourceIds).toEqual(expect.arrayContaining(["ctgov:NCT01009281", "pmid:22595313"]));
    expect(c?.label).toMatch(/not independent corroboration/);
    expect(l.independentStudies(["ctgov:NCT01009281", "pmid:22595313"])).toBe(1);
  });

  it("rejects findings that cite unknown sources", () => {
    const l = seeded();
    expect(() =>
      l.addFinding({ claim: "x", direction: "opposes", outcome: "negative", kind: "interpretation", sourceIds: ["pmid:99999999"] }),
    ).toThrow(LedgerError);
  });

  it("requires a verbatim passage for observations", () => {
    const l = seeded();
    const base = { claim: "Trial stopped for futility", direction: "opposes" as const, outcome: "negative" as const, kind: "observation" as const, sourceIds: ["ctgov:NCT00584740"] };
    expect(() => l.addFinding({ ...base, supportingPassage: "stopped because the drug was dangerous" })).toThrow(/not found verbatim/);
    const f = l.addFinding({ ...base, supportingPassage: "terminated prematurely after futility criterion was met" });
    expect(f.id).toBe("F1");
    expect(f.independentStudies).toBe(1);
  });

  it("counts linked records as one study when a finding cites both", () => {
    const l = seeded();
    const f = l.addFinding({
      claim: "Secukinumab was ineffective in active Crohn's disease",
      direction: "opposes",
      outcome: "negative",
      kind: "interpretation",
      sourceIds: ["pmid:22595313", "ctgov:NCT01009281"],
    });
    expect(f.independentStudies).toBe(1);
  });

  it("lets the model quote anything it was shown: excerpts and tool-formatted results", () => {
    const l = seeded();
    // Formatted outcome line from get_trial, appended to the record text by the tool.
    l.appendText("ctgov:NCT00584740", "SECONDARY RESULT — Percentage of Participants Achieving Remission and/or Response: AIN457: 26 (n=39); Placebo: 65 (n=20)");
    const f = l.addFinding({
      claim: "Remission/response 26% vs 65% placebo at week 6",
      direction: "opposes",
      outcome: "negative",
      kind: "observation",
      sourceIds: ["ctgov:NCT00584740"],
      supportingPassage: "Remission and/or Response: AIN457: 26 (n=39); Placebo: 65 (n=20)",
    });
    expect(f.id).toBe("F1");
    // The excerpt (status line) is verifiable too.
    expect(passageFound("results posted: yes", l.sources.get("ctgov:NCT00584740")!.text)).toBe(true);
  });

  it("records gaps distinctly from findings", () => {
    const l = seeded();
    l.addGap("No phase 3 IL-17A trial in Crohn's disease was retrieved", "search_trials condition=Crohn intervention=ixekizumab");
    expect(l.toEvidenceFile().gaps).toHaveLength(1);
    expect(l.toEvidenceFile().findings).toHaveLength(0);
  });

  it("builds a trial comparison in code that separates the RCT from the extension", () => {
    const l = seeded();
    const cmp = l.compareTrials(["ctgov:NCT00584740", "ctgov:NCT01009281"]);
    const [rct, ext] = cmp.rows;
    expect(rct.design).toMatch(/randomized/);
    expect(rct.enrollment).toBe(59);
    expect(ext.design).toMatch(/single-group/);
    expect(ext.enrollment).toBe(7);
    expect(rct.status).toMatch(/futility/);
  });
});

describe("RunStore", () => {
  it("round-trips an investigation folder and refuses path traversal", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "el-store-"));
    const id = makeRunId("IL-17A inhibition for Crohn's disease");
    expect(id).toMatch(/^\d{4}-\d{2}-\d{2}-il-17a-crohn-disease-[0-9a-f]{4}$/);
    const store = await RunStore.create(root, id);
    const l = seeded();
    await store.writeJson("run.json", {
      id, goal: "g", context: {}, model: "m", status: "completed", createdAt: new Date().toISOString(), steps: 3, usage: emptyTotals(), limits: { perRunCapUsd: 1.5, maxSteps: 40 },
    });
    await store.writeJson("evidence.json", l.toEvidenceFile());
    await store.writeJson("sources.json", l.toSourcesFile());
    await store.appendEvent({ type: "stage", stage: "searching", label: "Searching", tool: "search_trials" });
    await store.appendEvent({ type: "notice", message: "hi" });
    await store.saveFile("figures", "evidence-map.svg", "<svg/>");

    const inv = await loadInvestigation(root, id);
    expect(inv?.sources?.sources).toHaveLength(3);
    expect(inv?.figures).toEqual(["evidence-map.svg"]);
    expect((await readEvents(root, id)).map((e) => e.seq)).toEqual([1, 2]);
    expect((await listInvestigations(root))[0].sources).toBe(3);

    expect(await loadInvestigation(root, "../etc")).toBeNull();
    expect(resolveRunFile(root, id, "figures", "../run.json")).toBeNull();
    expect(resolveRunFile(root, id, "secrets", "a.txt")).toBeNull();
    await expect(store.saveFile("figures", "../x.svg", "")).rejects.toThrow(/Unsafe/);
  });
});
