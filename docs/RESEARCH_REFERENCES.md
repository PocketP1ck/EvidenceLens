# Research references and findings

These sources were consulted during the conversation. Recheck current SDK versions, API schemas, and selected adapters during implementation. No end-to-end EvidenceLens agent has yet been executed.

## Ambition and product framing

- [Felix Rieseberg: How to be more ambitious](https://felixrieseberg.com/how-to-be-more-ambitious-a-tutorial-for-humans-with-models/): outcome-oriented scope, professional methods, independent validation, and interdisciplinary work.
- [FDA: Discovery and Development](https://www.fda.gov/patients/drug-development-process/step-1-discovery-and-development): the discovery goal extends beyond protein facts to disease mechanisms and candidate characterization.

## Agent foundation

- [Deep Agents TypeScript documentation](https://docs.langchain.com/oss/javascript/deepagents/overview)
- [Deep Agents TypeScript repository](https://github.com/langchain-ai/deepagentsjs)
- [Deep Agents repository](https://github.com/langchain-ai/deepagents): MIT-licensed harness; model access is separate. Built on LangGraph, so a second orchestration layer is unnecessary.
- [ToolUniverse](https://github.com/mims-harvard/ToolUniverse): Apache-2.0 scientific tool layer. Select and smoke-test a small tool set instead of treating catalog availability as proof of working integrations.
- [BioContextAI](https://biocontext.ai/docs): optional biomedical MCP resource layer; hosted proof-of-concept availability and limits need verification.

Alternatives considered: [BioChatter](https://github.com/biocypher/biochatter), [Biomni](https://github.com/snap-stanford/Biomni), [TxAgent](https://github.com/mims-harvard/TxAgent), and [PaperQA](https://github.com/Future-House/paper-qa). These are not initial dependencies. Biomni’s environment and default datalake are substantial; TxAgent’s recommended inference infrastructure is heavier than this prototype needs.

## Scientific sources

| Source | Interface and role |
| --- | --- |
| [Open Targets GraphQL](https://platform-docs.opentargets.org/data-access/graphql-api) | https://api.platform.opentargets.org/api/v4/graphql — disease/target resolution and evidence breakdowns |
| [UniProt REST](https://www.uniprot.org/api-documentation) | https://rest.uniprot.org/uniprotkb/ — protein sequence, features, evidence, references |
| [AlphaFold DB API](https://alphafold.ebi.ac.uk/api-docs) | https://alphafold.ebi.ac.uk/api/prediction/{accession} — existing structure models and metadata |
| [3Dmol](https://www.3dmol.org/doc/tutorial-code.html) | Browser structure visualization, selections, and coloring |
| [ChEMBL services](https://chembl.gitbook.io/chembl-interface-documentation/web-services/chembl-data-web-services) | https://www.ebi.ac.uk/chembl/api/data/ — molecules, mechanisms, targets, assays, activities, documents |
| [Europe PMC REST](https://europepmc.org/RestfulWebService) | https://www.ebi.ac.uk/europepmc/webservices/rest/ — metadata, abstracts, eligible open-access full text |
| [ClinicalTrials.gov API](https://clinicaltrials.gov/data-api/api) | https://clinicaltrials.gov/api/v2 — trial protocols, status, available results |

## Important implementation findings

- Open Targets association scores support ranking; they are not probabilities of therapeutic success. [Scoring documentation](https://github.com/opentargets/platform-docs/blob/main/associations.md).
- Preserve ChEMBL assay type, units, relation operators, target type, and assay-to-target confidence. Binding, cellular activity, and clinical benefit are different observations. [Data guidance](https://chembl.gitbook.io/chembl-interface-documentation/frequently-asked-questions/chembl-data-questions).
- A reviewed UniProt record does not make every annotation experimentally demonstrated. Retain feature-level evidence and references.
- AlphaFold can return multiple isoforms or models/providers. Select explicitly and verify sequence identity before mapping UniProt residue positions. Use returned model URLs rather than hardcoding a model version.
- pLDDT describes local structural confidence; PAE concerns relative-position uncertainty. Low confidence can reflect disorder or context-dependent structure. [AlphaFold FAQ](https://alphafold.ebi.ac.uk/faq).
- A target–disease association does not supply residue coordinates. Only appropriately mapped annotations should highlight specific residues.
- Trial registration, completed status, termination, and posted outcomes are different facts. Termination alone does not identify a biological failure.
- A repeated source publication in several databases is one study, not independent corroboration.

## Earlier structure integration checks

Read-only research checks succeeded for these example mappings. Revalidate before use:

| Gene | Ensembl ID | Reviewed UniProt accession |
| --- | --- | --- |
| TP53 | ENSG00000141510 | P04637 |
| HBB | ENSG00000244734 | P68871 |
| ALB | ENSG00000163631 | P02768 |

The broader ChEMBL/literature/trial workflow was documented but not smoke-tested end to end in an application runtime.

## Proposed historical demonstration

- [Secukinumab study, primary full text](https://pmc.ncbi.nlm.nih.gov/articles/PMC4902107/)
- [PubMed record](https://pubmed.ncbi.nlm.nih.gov/22595313/)
- [Trial registration](https://clinicaltrials.gov/study/NCT01009281)
- PMID 22595313; PMCID PMC4902107; NCT01009281.

This trial reported ineffective IL-17A blockade and higher adverse-event rates than placebo in its studied Crohn’s population. The demonstration should retrieve and contextualize that finding, rather than generalizing it across diseases or presenting a clinical recommendation.

## Kiro

- [Specs](https://kiro.dev/docs/specs/)
- [MCP](https://kiro.dev/docs/mcp/)
- [Hooks](https://kiro.dev/docs/hooks/)

Kiro must do substantive implementation and verification. Hook availability differs by surface; desktop/CLI support event-driven hooks, while browser development can explicitly run the required checks.
