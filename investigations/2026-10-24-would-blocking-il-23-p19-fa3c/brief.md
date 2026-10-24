# IL-23 p19 blockade (risankizumab) in Crohn's disease

**Question:** Would blocking the IL-23 p19 subunit (IL23A) with risankizumab help patients with moderate-to-severe Crohn's disease?

**Assessment:** Supported by retrieved evidence. Randomised phase 3 trials show that risankizumab, a p19-directed IL-23 antibody, improved clinical remission and endoscopic response over placebo in induction and maintenance in moderate-to-severe Crohn's disease, including patients who had failed biologics. The benefit is partial, and the evidence is sponsor-funded and placebo-controlled. [1][2][3]

## Key findings
- Induction (ADVANCE/MOTIVATE): all co-primary week-12 endpoints met with 600 and 1200 mg IV; MOTIVATE (biologic-failure) CDAI remission 42%/40% vs 20% placebo, endoscopic response 29%/34% vs 11%. [1][2] _(F3)_
- Maintenance (FORTIFY, withdrawal design): SC 360 mg q8w gave week-52 CDAI remission 52% vs 41% and endoscopic response 47% vs 22% against withdrawal to placebo. [3] _(F4)_
- Open Targets association 0.61 is dominated by clinical evidence (0.99); literature and expression evidence are low, so the support is largely pharmacological. [4] _(F1)_
- Risankizumab is annotated as an IL-23 inhibitor targeting the p19-containing IL-23 (Q9NPF7). [5] _(F2)_

## Opposing evidence
- Benefit is incomplete: in FORTIFY, 180 mg did not significantly beat withdrawal on stool-frequency/abdominal-pain remission (p=0.124). Absolute induction remission gains were about 15-22 points, so most patients remained out of remission. Worsening Crohn's disease was among the common adverse events. [3] _(F5)_

## Context differences
- Induction populations differed: ADVANCE included conventional-therapy and biologic failures, while MOTIVATE included only biologic failures. FORTIFY enrolled induction responders only, so maintenance results do not apply to non-responders. [1][2][3] _(F3, F4)_
- ChEMBL lists Crohn's disease at max phase 3, while the overall max phase is 4. This reflects the annotation only and says nothing about efficacy. [5] _(F2)_
- No experimental risankizumab-IL23A complex was found. The AlphaFold model's pLDDT reflects structural confidence, not disease relevance. [6] _(F6)_

## Limitations
- Pivotal evidence comes from sponsor-funded (AbbVie) trials. Records for the same study (registry and paper) are not independent.
- Trial comparators were placebo or placebo withdrawal. No head-to-head result was retrieved.
- The registry results table for NCT03104413 had duplicated or mislabelled US vs global rows, so numbers were taken from the publication.
- Only the primary publications were read. Real-world and long-term safety reports were not examined.
- Risankizumab blocks the p19 subunit of IL-23, but this work did not isolate p19-specific effects from IL-23 pathway effects generally.

## Unknowns
- Comparative efficacy against ustekinumab, anti-TNF and other IL-23 agents in Crohn's disease.
- Durability and long-term safety beyond 52 weeks.
- Efficacy in specific subgroups such as perianal fistulizing and pediatric disease.
- Which patients respond, since no predictive biomarker was identified.

## Next research questions
- How does risankizumab compare with ustekinumab or adalimumab in head-to-head Crohn's disease trials?
- What are the long-term (>52 weeks) safety and durability data from open-label extensions?
- What do real-world cohorts show for patients who failed prior biologics?
- Is there genetic or biomarker evidence that predicts response to p19 blockade?

## Evidence ledger

| ID | Kind | Direction | Outcome | Claim | Population | Endpoint | Studies | Sources |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | observation | supports | not applicable | Open Targets gives a moderate IL23A–Crohn disease association score (0.61), driven almost entirely by clinical-stage evidence (0.99); literature 0.245 and RNA expression 0.043 are low. | — | — | 1 | [4] |
| F2 | observation | context | not applicable | Risankizumab is an IL-23 inhibitor antibody acting on IL-23 (including p19/IL23A, Q9NPF7); ChEMBL max phase 4 overall (first approval 2019) with Crohn's disease listed at max phase 3 in this record. | — | — | 1 | [5] |
| F3 | observation | supports | positive | Phase 3 ADVANCE and MOTIVATE induction trials (IV risankizumab 600/1200 mg vs placebo, weeks 0/4/8) met all co-primary endpoints at week 12 (clinical remission and endoscopic response) in moderate-to-severe Crohn's disease; in MOTIVATE (biologic-failure population) CDAI remission was 42%/40% vs 20% placebo and endoscopic response 29%/34% vs 11%. | Adults 16-80 y; ADVANCE: biologic or conventional failure; MOTIVATE: biologic failure | Week 12 clinical remission and endoscopic response | 1 | [1][2] |
| F4 | observation | supports | positive | In the FORTIFY randomised withdrawal maintenance trial (SC risankizumab q8w, induction responders), 360 mg beat placebo withdrawal at week 52 for CDAI remission (52% vs 41%) and endoscopic response (47% vs 22%). | Induction responders from ADVANCE/MOTIVATE | Week 52 clinical remission and endoscopic response | 1 | [3] |
| F5 | observation | opposes | null | Not all benefit is large or uniform: in FORTIFY, the 180 mg dose did not significantly beat withdrawal on stool-frequency/abdominal-pain remission (p=0.124), and the absolute remission gain vs placebo in induction (~15–22 points) leaves most patients not in remission; the most common AEs included worsening Crohn's disease. | — | — | 1 | [3] |
| F6 | interpretation | context | not applicable | No experimental structure of risankizumab bound to IL23A was found; an AlphaFold model of IL23A (mean pLDDT 80.56) was selected, which is structural confidence only and not disease relevance. | — | — | 1 | [6] |

## Evidence not retrieved

- **G1** Could not retrieve a head-to-head trial (e.g., risankizumab vs ustekinumab) or long-term safety/real-world data in a form that supports comparative claims; real-world studies appeared in search but were not read. _(attempted: search_trials risankizumab vs ustekinumab Crohn's; search_literature risankizumab crohn ustekinumab (recent))_

## Linked records

- Linked records (NCT03104413 ↔ PMID 35644154): one study or report, not independent corroboration: [2], [1]
- Linked records (NCT02513459 ↔ PMID 34077509): one study or report, not independent corroboration: ctgov:NCT02513459, pmid:34077509

## Structure

- AlphaFold prediction for Interleukin-23 subunit alpha (IL23A) (AF-Q9NPF7-F1 v6; predicted, mean pLDDT 80.56)
- Identity: Model sequence identical to UniProt sequence
- Selection: Predicted model of the target; no experimental complex with the intervention was found.

## Sources

1. [Risankizumab as induction therapy for Crohn's disease: results from the phase 3 ADVANCE and MOTIVATE induction trials.](https://europepmc.org/article/MED/35644154) — Europe PMC, `pmid:35644154`, 2022. Retrieved 2026-10-24T19:00:42.117Z.
2. [A Study to Assess the Efficacy and Safety of Risankizumab in Participants With Moderately to Severely Active Crohn's Disease Who Failed Prior Biologic Treatment](https://clinicaltrials.gov/study/NCT03104413) — ClinicalTrials.gov, `ctgov:NCT03104413`, 2017. Retrieved 2026-10-24T19:00:38.091Z.
3. [Risankizumab as maintenance therapy for moderately to severely active Crohn's disease: results from the multicentre, randomised, double-blind, placebo-controlled, withdrawal phase 3 FORTIFY maintenance trial.](https://europepmc.org/article/MED/35644155) — Europe PMC, `pmid:35644155`, 2022. Retrieved 2026-10-24T19:00:46.599Z.
4. [IL23A – Crohn disease association](https://platform.opentargets.org/evidence/ENSG00000110944/MONDO_0005011) — Open Targets, `ot:ENSG00000110944:MONDO_0005011`. Retrieved 2026-10-24T19:00:26.876Z.
5. [RISANKIZUMAB (Antibody)](https://www.ebi.ac.uk/chembl/explore/compound/CHEMBL3990029) — ChEMBL, `chembl:CHEMBL3990029`. Retrieved 2026-10-24T19:00:32.478Z.
6. [AlphaFold prediction for Interleukin-23 subunit alpha (IL23A)](https://alphafold.ebi.ac.uk/entry/Q9NPF7) — AlphaFold DB, `alphafold:AF-Q9NPF7-F1`. Retrieved 2026-10-24T19:00:32.892Z.

---
_Generated by EvidenceLens run `2026-10-24-would-blocking-il-23-p19-fa3c` (claude-sonnet-5-5, 2026-10-24T19:00:19.658Z, API cost $0.177). Every claim cites findings recorded against retrieved sources. This is a research brief, not clinical advice._
