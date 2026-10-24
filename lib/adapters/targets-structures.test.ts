import { afterEach, describe, expect, it } from "vitest";
import { getAssociation, normalizeAssociation, searchEntity, type AssociationData } from "./opentargets";
import { findHumanAccession, normalizeProtein, type ProteinData } from "./uniprot";
import { normalizeCompound, searchCompound, type CompoundData } from "./chembl";
import { findStructure, normalizePdbEntries, pickAlphaFold, pickExperimental } from "./structures";
import { fixture, mockFetch, resetFetch } from "./testing";

afterEach(resetFetch);

describe("Open Targets adapter", () => {
  it("resolves IL17A and Crohn disease to current identifiers", async () => {
    mockFetch([
      ['"e":["target"]', fixture("ot-search-target-IL17A.json")],
      ['"e":["disease"]', fixture("ot-search-disease-crohn.json")],
    ]);
    expect((await searchEntity("IL17A", "target"))[0].id).toBe("ENSG00000112115");
    expect((await searchEntity("Crohn disease", "disease"))[0].id).toBe("MONDO_0005011");
  });

  it("labels the association score as a ranking signal and joins to UniProt in code", () => {
    const rec = normalizeAssociation(fixture<{ data: never }>("ot-assoc-IL17A-crohn.json").data);
    const d = rec.data as unknown as AssociationData;
    expect(rec.id).toBe("ot:ENSG00000112115:MONDO_0005011");
    expect(d.associationScore).toBe(0.1);
    expect(d.datatypeScores[0]).toEqual({ datatype: "literature", score: 0.503 });
    expect(d.uniprotAccession).toBe("Q16552");
    expect(rec.excerpt).toMatch(/not probabilities of therapeutic success/);
  });

  it("validates identifiers before calling the API", async () => {
    await expect(getAssociation("IL17A", "MONDO_0005011")).rejects.toThrow(/Ensembl/);
  });
});

describe("UniProt adapter", () => {
  it("keeps per-feature experimental evidence counts", () => {
    const rec = normalizeProtein(fixture("uniprot-Q16552.json"));
    const d = rec.data as unknown as ProteinData;
    expect(d.reviewed).toBe(true);
    expect(d.gene).toBe("IL17A");
    expect(d.length).toBe(155);
    expect(d.functionEvidence.experimental).toBeGreaterThan(0);
    expect(d.features.find((f) => f.type === "Mutagenesis")).toBeDefined();
    expect(d.annotationNote).toMatch(/does not make every annotation experimentally demonstrated/);
  });

  it("finds the reviewed human accession for a gene", async () => {
    mockFetch([["gene_exact", fixture("uniprot-search-IL17A.json")]]);
    expect(await findHumanAccession("IL17A")).toMatchObject({ accession: "Q16552" });
  });
});

describe("ChEMBL adapter", () => {
  it("joins the secukinumab mechanism target to UniProt and keeps indication phases", async () => {
    mockFetch([
      ["molecule/search", fixture("chembl-search-secukinumab.json")],
      ["mechanism.json", fixture("chembl-mechanism-CHEMBL1743068.json")],
      ["drug_indication.json", fixture("chembl-indication-CHEMBL1743068.json")],
      ["target/CHEMBL3390822", fixture("chembl-target-CHEMBL3390822.json")],
    ]);
    const [rec] = await searchCompound("secukinumab");
    const d = rec.data as unknown as CompoundData;
    expect(rec.id).toBe("chembl:CHEMBL1743068");
    expect(d.maxPhase).toBe(4);
    expect(d.mechanisms[0]).toMatchObject({ actionType: "INHIBITOR", targetUniprot: ["Q16552"] });
    expect(d.indications.find((i) => i.term === "Crohn's disease")?.maxPhaseForIndication).toBe(2);
    expect(d.activities).toEqual([]); // antibody: no small-molecule activity lookup
  });

  it("returns nothing for an unknown compound", async () => {
    mockFetch([["molecule/search", { molecules: [] }]]);
    expect(await searchCompound("notadrug")).toEqual([]);
  });

  it("does not invent targets when mechanisms are missing", () => {
    const rec = normalizeCompound({ molecule_chembl_id: "CHEMBL1", molecule_type: "Small molecule", max_phase: null }, [], [], new Map());
    expect((rec.data as unknown as CompoundData).mechanisms).toEqual([]);
    expect(rec.excerpt).toMatch(/none recorded/);
  });
});

describe("Structure selection", () => {
  const entries = normalizePdbEntries(fixture<{ data: { entries: never[] } }>("rcsb-graphql-IL17A.json").data.entries);

  it("selects 9SFX for secukinumab bound to IL-17A and separates crystallization aids", () => {
    const pick = pickExperimental(entries, "Q16552", ["secukinumab"]);
    expect(pick?.entry.pdbId).toBe("9SFX");
    expect(pick?.choice.targetChains).toEqual(["C"]);
    const intervention = pick!.choice.partnerChains.filter((p) => p.role === "intervention");
    expect(intervention.length).toBeGreaterThan(0);
    expect(intervention.every((p) => /secukinumab/i.test(p.label))).toBe(true);
    expect(pick!.choice.partnerChains.some((p) => p.role === "other" && /crystallization aid/i.test(p.label))).toBe(true);
  });

  it("rejects entries whose target chain does not map to the accession", () => {
    expect(pickExperimental(entries, "P04637", ["secukinumab"])).toBeNull();
  });

  it("does not substitute a different antibody when the named intervention is absent", () => {
    expect(pickExperimental(entries, "Q16552", ["risankizumab"])).toBeNull();
  });

  it("verifies AlphaFold sequence identity against UniProt", () => {
    const af = fixture<never[]>("alphafold-Q16552.json");
    const seq = (fixture<{ sequence: { value: string } }>("uniprot-Q16552.json")).sequence.value;
    const ok = pickAlphaFold(af, "Q16552", seq);
    expect(ok?.identity.verified).toBe(true);
    expect(ok?.modelId).toBe("AF-Q16552-F1 v6");
    expect(ok?.meanPlddt).toBeCloseTo(84.31, 2);
    const bad = pickAlphaFold(af, "Q16552", "MAAAA");
    expect(bad?.identity.verified).toBe(false);
    expect(bad?.identity.method).toMatch(/MISMATCH/);
  });

  it("falls back to AlphaFold when no complex names the intervention (IL-23 / risankizumab)", async () => {
    mockFetch([
      ["rcsbsearch", { result_set: [{ identifier: "5NJD" }] }],
      ["data.rcsb.org/graphql", { data: { entries: [{ rcsb_id: "5NJD", struct: { title: "Structure of Interleukin 23 in complex with Briakinumab FAb" }, rcsb_entry_info: { resolution_combined: [3.9] }, polymer_entities: [{ rcsb_polymer_entity: { pdbx_description: "Interleukin-23 subunit alpha" }, rcsb_polymer_entity_container_identifiers: { auth_asym_ids: ["A"], uniprot_ids: ["Q9NPF7"] } }, { rcsb_polymer_entity: { pdbx_description: "Briakinumab FAb Heavy chain" }, rcsb_polymer_entity_container_identifiers: { auth_asym_ids: ["H"], uniprot_ids: [] } }] }] } }],
      ["alphafold.ebi.ac.uk/api", fixture("alphafold-Q9NPF7.json")],
    ]);
    const seq = fixture<{ sequence: { value: string } }>("uniprot-Q9NPF7.json").sequence.value;
    const res = await findStructure({ uniprotAccession: "Q9NPF7", interventionNames: ["risankizumab"], uniprotSequence: seq });
    expect(res.choice?.type).toBe("predicted");
    expect(res.choice?.identity.verified).toBe(true);
    expect(res.notes[0]).toMatch(/not substituted/);
    expect(res.considered[0]).toMatchObject({ pdbId: "5NJD", matchedIntervention: false });
  });

  it("reports no structure instead of inventing one", async () => {
    mockFetch([
      ["rcsbsearch", null, 204],
      ["alphafold.ebi.ac.uk/api", "not found", 404],
    ]);
    const res = await findStructure({ uniprotAccession: "Q00000", interventionNames: ["x-drug"] });
    expect(res.choice).toBeNull();
    expect(res.notes.join(" ")).toMatch(/AlphaFold DB lookup failed/);
  });
});
