/**
 * Live smoke test for source adapters (no model calls, no cost).
 *   npm run probe -- trials "Crohn disease" secukinumab
 *   npm run probe -- trial NCT00584740
 *   npm run probe -- lit secukinumab "crohn*"
 *   npm run probe -- target IL17A | disease "Crohn disease"
 *   npm run probe -- assoc ENSG00000112115 MONDO_0005011
 *   npm run probe -- protein Q16552 | compound secukinumab
 *   npm run probe -- structure Q16552 secukinumab
 *   npm run probe -- all
 */
import { getTrial, searchTrials } from "@/lib/adapters/clinicaltrials";
import { searchLiterature } from "@/lib/adapters/europepmc";
import { getAssociation, searchEntity } from "@/lib/adapters/opentargets";
import { getProtein } from "@/lib/adapters/uniprot";
import { searchCompound } from "@/lib/adapters/chembl";
import { findStructure } from "@/lib/adapters/structures";
import type { SourceRecord } from "@/lib/adapters/types";

const [cmd, ...args] = process.argv.slice(2);

function show(recs: SourceRecord[]) {
  for (const r of recs) console.log(`- ${r.id} | ${r.title.slice(0, 90)}\n    ${r.excerpt.slice(0, 220)}`);
}

async function run(c: string, a: string[]) {
  switch (c) {
    case "trials":
      return show(await searchTrials({ condition: a[0], intervention: a[1], max: 6 }));
    case "trial":
      return console.log(JSON.stringify((await getTrial(a[0])).data, null, 2).slice(0, 2500));
    case "lit": {
      const r = await searchLiterature({ terms: a, sort: "cited", max: 6 });
      console.log(`query: ${r.query} (hits ${r.hitCount})`);
      return show(r.records);
    }
    case "target":
    case "disease":
      return console.log(await searchEntity(a.join(" "), c));
    case "assoc":
      return show([await getAssociation(a[0], a[1])]);
    case "protein":
      return show([await getProtein(a[0])]);
    case "compound":
      return show(await searchCompound(a[0]));
    case "structure": {
      const p = await getProtein(a[0]);
      const r = await findStructure({ uniprotAccession: a[0], interventionNames: a.slice(1), uniprotSequence: (p.data as { sequence?: string }).sequence });
      console.log({ choice: r.choice && { ...r.choice, plddtBands: undefined }, notes: r.notes, considered: r.considered.length });
      return;
    }
    case "all": {
      const steps: [string, string[]][] = [
        ["target", ["IL17A"]],
        ["disease", ["Crohn disease"]],
        ["assoc", ["ENSG00000112115", "MONDO_0005011"]],
        ["protein", ["Q16552"]],
        ["compound", ["secukinumab"]],
        ["trials", ["Crohn disease", "secukinumab"]],
        ["lit", ["secukinumab", "crohn*"]],
        ["structure", ["Q16552", "secukinumab"]],
        ["structure", ["Q9NPF7", "risankizumab"]],
        ["trials", ["Crohn disease", "risankizumab"]],
      ];
      for (const [s, sa] of steps) {
        const t = Date.now();
        console.log(`\n=== ${s} ${sa.join(" ")}`);
        try {
          await run(s, sa);
          console.log(`  ok (${Date.now() - t} ms)`);
        } catch (err) {
          console.log(`  FAILED: ${(err as Error).message}`);
        }
      }
      return;
    }
    default:
      console.log("Unknown command. See header of scripts/probe.ts.");
  }
}

run(cmd ?? "all", args).catch((err) => {
  console.error(err);
  process.exit(1);
});
