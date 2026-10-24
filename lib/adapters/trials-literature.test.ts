import { afterEach, describe, expect, it } from "vitest";
import { getTrial, normalizeStudy, searchTrials, type TrialData } from "./clinicaltrials";
import { buildQuery, getPublication, normalizePublication, searchLiterature } from "./europepmc";
import { fixture, mockFetch, resetFetch } from "./testing";

afterEach(resetFetch);

describe("ClinicalTrials.gov adapter", () => {
  it("normalizes the secukinumab core RCT with posted results and its publication link", () => {
    const rec = normalizeStudy(fixture("ctgov-NCT00584740.json"));
    const d = rec.data as unknown as TrialData;
    expect(rec.id).toBe("ctgov:NCT00584740");
    expect(rec.kind).toBe("trial");
    expect(d.allocation).toBe("RANDOMIZED");
    expect(d.enrollment).toBe(59);
    expect(d.status).toBe("TERMINATED");
    expect(d.whyStopped).toMatch(/futility/i);
    expect(d.hasResults).toBe(true);
    expect(d.adverseEvents.map((a) => a.serious)).toEqual(["7/39", "3/20"]);
    // The core RCT registration lists no publications on CT.gov.
    expect(rec.linked).toEqual([]);
    expect(rec.text).toMatch(/futility criterion was met/);
  });

  it("keeps the extension study distinct: single-group, 7 participants, linked to the RCT paper", () => {
    const rec = normalizeStudy(fixture("ctgov-NCT01009281.json"));
    const d = rec.data as unknown as TrialData;
    expect(d.allocation).toBe("NA");
    expect(d.enrollment).toBe(7);
    expect(d.orgStudyId).toBe("CAIN457A2202E1");
    expect(rec.linked).toContainEqual({ pmid: "22595313" });
    expect(d.references[0].type).toBe("DERIVED");
  });

  it("searches with condition and intervention parameters", async () => {
    const calls = mockFetch([["/studies?", fixture("ctgov-search-secukinumab-crohn.json")]]);
    const recs = await searchTrials({ condition: "Crohn disease", intervention: "secukinumab", max: 5 });
    expect(calls[0]).toContain("query.cond=Crohn+disease");
    expect(calls[0]).toContain("query.intr=secukinumab");
    expect(recs.map((r) => r.identifiers.nct)).toEqual(expect.arrayContaining(["NCT00584740", "NCT01009281"]));
  });

  it("returns an empty list when no studies match", async () => {
    mockFetch([["/studies?", { studies: [] }]]);
    expect(await searchTrials({ condition: "nothing" })).toEqual([]);
  });

  it("rejects malformed NCT IDs before any request", async () => {
    await expect(getTrial("NCT123")).rejects.toThrow(/Invalid NCT/);
  });
});

describe("Europe PMC adapter", () => {
  it("builds a fielded title/abstract query", () => {
    expect(buildQuery({ terms: ["secukinumab", "crohn*"] })).toBe(
      '(TITLE:"secukinumab" OR ABSTRACT:"secukinumab") AND (TITLE:crohn* OR ABSTRACT:crohn*)',
    );
  });

  it("normalizes PMID 22595313 with PMCID and DOI", () => {
    const raw = fixture<{ resultList: { result: unknown[] } }>("epmc-pmid-22595313.json").resultList.result[0];
    const rec = normalizePublication(raw as never);
    expect(rec.id).toBe("pmid:22595313");
    expect(rec.identifiers).toMatchObject({ pmid: "22595313", pmcid: "PMC4902107", doi: "10.1136/gutjnl-2011-301668" });
    expect(rec.year).toBe(2012);
    expect(rec.text).toMatch(/double-blind, randomised, placebo-controlled/);
    expect(rec.text).not.toMatch(/<h4>/);
  });

  it("fetches a single publication by PMID", async () => {
    mockFetch([["EXT_ID", fixture("epmc-pmid-22595313.json")]]);
    const rec = await getPublication("22595313");
    expect(rec.title).toMatch(/Secukinumab/);
  });

  it("handles empty search results", async () => {
    mockFetch([["/search?", { hitCount: 0, resultList: { result: [] } }]]);
    const res = await searchLiterature({ terms: ["zzzz"] });
    expect(res.hitCount).toBe(0);
    expect(res.records).toEqual([]);
  });
});
