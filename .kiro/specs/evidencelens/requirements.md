# Requirements: EvidenceLens

## Introduction

EvidenceLens is one independent research agent. A user gives it a disease–target–intervention hypothesis; it investigates public scientific sources, actively searches for counterevidence, and saves a visual, source-backed research package. Deliverable: a 2-minute recorded video and this repository (Healthcare & biotech track).

## Requirements

### R1 Goal-driven investigation
**User story:** As a researcher, I enter a research goal (optionally target, disease, compound) and the agent investigates without asking me to approve each step.
1. WHEN the user submits a goal THEN the system SHALL start one autonomous investigation and return a run ID.
2. The agent SHALL create a bounded plan before retrieving evidence.
3. The agent SHALL NOT be able to finish until it has run at least one search marked as a counterevidence search.

### R2 Evidence contract (enforced in code)
1. Every retrieved record SHALL be registered by an adapter as a source with ID, URL, retrieval time and excerpt; the model SHALL NOT create sources.
2. WHEN the model records a finding citing an unknown source ID THEN the harness SHALL reject it with an actionable error.
3. Observations SHALL include a supporting passage that appears verbatim in the cited source text.
4. Each finding SHALL keep claim, direction (supports/opposes/context), outcome (positive/negative/null/not posted/not applicable), kind (observation/interpretation/hypothesis), intervention, disease, population/species, endpoint, study context and limitations.
5. Records sharing a PMID, PMCID, NCT number or DOI SHALL be clustered as one study.
6. Evidence not retrieved SHALL be recorded as a gap, distinct from null or opposing results.
7. Every brief claim SHALL cite at least one recorded finding.

### R3 Budget and safety
1. The harness SHALL compute cost from API usage (including cache reads/writes) and stop at $1.50 per run or $12 cumulative.
2. Near the limit, the harness SHALL force the agent to finalize.
3. The API key SHALL only be used server-side and never written to outputs.

### R4 Truthful activity
1. The status line and otter pose SHALL derive only from the tool currently executing.
2. Motion SHALL respect `prefers-reduced-motion`; status SHALL be announced via `aria-live`.

### R5 Research package
1. Each run SHALL write `investigations/<run-id>/` with `brief.md`, `brief.json`, `evidence.json`, `sources.json`, `run.json`, `events.jsonl`, `figures/`, `structures/`.
2. The report SHALL show an interactive 3D structure with model identity and confidence, a saved structure figure, an evidence relationship diagram, and a study timeline.
3. Structure selection SHALL verify the target UniProt mapping; if no suitable structure exists the gap SHALL be recorded.

### R6 Recording
1. Saved runs SHALL be replayable through the same UI without API calls.
