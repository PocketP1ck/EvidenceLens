# Product and design brief

## Product promise

Give the agent a worthwhile drug-discovery research question. It investigates independently and leaves behind a carefully prepared, visual, source-backed body of research.

The first measurable benefit is faster preparation of an inspectable research brief and better visibility of evidence that changes a research decision. Improved drug-development timelines are a longer-term goal requiring evaluation.

## Primary experience

1. User enters a goal, with optional target, disease, or compound context.
2. Agent resolves entities and develops a bounded investigation plan.
3. It retrieves evidence, actively searches for opposing findings, and compares relevant contexts.
4. Otter animation and a concise activity line show its real execution stage.
5. The agent saves a completed investigation folder and presents its main findings.
6. User opens the research package, examines the visualizations, and follows sources where useful.

The main screen should prioritize the goal, the otter, the current activity, and completed investigations. Avoid a fleet dashboard, arbitrary performance counters, an always-visible tool log, and a wall of status cards.

## Research output

Each investigation should contain:

- Research brief with the question, findings, limitations, and next questions.
- Structured evidence ledger and source manifest.
- Relevant interactive 3D structure, with model identity and confidence information where available.
- Saved 3D figure suitable for presenting the result.
- Evidence relationship diagram.
- A question-specific figure, such as an evidence timeline or a context-aware study comparison.
- Optional detailed execution trace, available on demand.

Illustrative future folder structure:

```text
investigations/<run-id>/
  brief.md
  evidence.json
  sources.json
  run.json
  figures/
  structures/
```

A relevant structure is part of the supported demonstration scope. If a requested research question has no suitable structure, record the missing information rather than inventing a model or using an unrelated decorative molecule.

## Visual language

| Token | Intended role |
| --- | --- |
| #8FD9FB | Pale atmospheric surfaces and depth |
| #4AB5B5 | Secondary accents and source relationships |
| #6D8BC0 | Quiet structural lines and contextual marks |
| #525AFF | Focus, selected elements, primary action |
| Dark neutral ink | Readable text and essential labels |
| White | Main surface and generous negative space |

Use scientific precision and architectural spacing. Borrow the sense of light, distance, and clean geometry from the visual references without copying game assets or interfaces.

## Otter

A minimal contour mascot, primarily drawn with the brand colors. Its posture should communicate work calmly:

- Planning: attentive, sitting upright.
- Searching: following an extending line.
- Reading: holding a small sheet.
- Comparing: considering two objects or paths.
- Writing: arranging lines into a document.
- Finished: resting beside the completed research.

Respect reduced-motion settings. Do not animate fake progress or present hidden reasoning as an execution trace. Activity labels should identify observable work such as retrieving a study or comparing two source records.

## Evidence contract

Keep each item’s claim, source IDs/URLs, supporting passage, retrieval time, intervention direction, disease, species/population, endpoint, study context, and limitations. Group repeated mentions of the same study.

Distinguish evidence not retrieved, results not posted, null results, opposing results, and context differences. Keep observations, interpretations, and proposed hypotheses identifiable.

Calculate numerical values and identifier joins in code. Cite only records actually retrieved. Protein structure confidence, target–disease association ranking, and experimental annotation evidence are distinct concepts.

## First demonstration

A historical investigation of IL17A inhibition in Crohn’s disease is a proposed seeded case. The agent should retrieve the relevant secukinumab trial, preserve its intervention and population context, and reflect its findings in the assessment. This is a retrieval-and-reasoning test, not a newly discovered therapeutic prediction.

## Kiro implementation sequence

1. Recheck setup, runtime model access, time remaining, and agreed spending limits.
2. Use Kiro to turn this brief into requirements, design, and tasks.
3. Implement one end-to-end investigation with a small validated tool set.
4. Build the goal/otter interface and investigation folders.
5. Add the three visual outputs and exportable research brief.
6. Verify entity joins, source references, duplicate studies, empty results, context distinctions, and budget/stop behavior.
7. Polish and rehearse the demonstration. Preserve actual Kiro implementation and test history for judging.
