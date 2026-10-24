# Conversation summary

This is a curated record of the discussion and decisions, not a verbatim conversation export. User decisions take priority over earlier assistant suggestions.

## Hackathon context

- Tracks: Healthcare & biotech; Robotics & hardware.
- Original constraint: five hours, solo, no particular access to company data or hardware. Confirm remaining time when implementation begins.
- Mandatory development environment: Kiro, with a supplied allowance originally described as 2,000 tokens. Prior research suggested the allowance might mean credits; its actual unit and balance remain unverified.
- Judging: potential value; thoughtful Kiro/AI implementation and creative integrations; originality, intuitive experience, and polished design.

## How the idea developed

1. Initial brainstorming included data licensing and dataset packaging. The user explicitly requested other directions; these are not the selected product.
2. We explored healthcare, biotech, robotics, hardware, scientific computation, and source-backed research tools.
3. The user liked gesture-driven robot simulation and a biotech evidence explorer, then selected the evidence explorer.
4. EvidenceLens initially connected UniProt, Open Targets, AlphaFold DB, and 3Dmol.
5. The user expanded the ambition to helping drug discovery, rather than only learning more about proteins.
6. The proposed research unit became a disease–target–intervention hypothesis, investigated using supporting and opposing evidence, compound/assay context, publications, and human-study records.
7. The user wanted an open-source agent harness. Deep Agents with Claude and selected scientific tools became the proposed foundation.
8. An observatory-style dashboard and a future involving millions of agents were explored. The user then explicitly rejected the SaaS feeling and chose one independent research agent with a minimal otter mascot.

## Latest accepted product direction

- One independent agent investigates a goal supplied by the user.
- A prominent goal field is the starting interaction.
- A minimalist contour otter and a quiet status line communicate the actual research stage.
- The agent plans, searches, follows relevant leads, seeks counterevidence, reconciles findings, and assembles the research package.
- Completed investigations live in folders; individual reports remain easy to open.
- The experience should not require watching or approving every tool call.
- Each supported demonstration should produce at least three meaningful visuals, including a relevant 3D protein or molecular view and a saved figure.
- Preserve supporting evidence, opposing evidence, context differences, unknowns, sources, and next research questions.

## Design preferences

- Brand colors: #8FD9FB, #4AB5B5, #6D8BC0, #525AFF.
- White space, fine architectural lines, restrained accents, dark readable text.
- Fortune 500 trust with a futuristic scientific atmosphere.
- References: Mirror’s Edge architectural whiteness and Assassin’s Creed/Animus loading-space aesthetics.
- Mascot: otter, minimal contours using the palette; thoughtful and curious rather than a busy cartoon.
- Animation communicates stages such as planning, searching, reading, comparing, writing, and completion. Stage text must correspond to actual execution.
- The former observatory/portfolio dashboard is superseded. There is no current requirement for millions of agents, fleet management, a SaaS dashboard, or multiple simultaneous research agents.

## Proposed technical foundation

- Kiro: actual implementation, source integration, testing, and verification.
- Next.js and TypeScript: application and server routes.
- Deep Agents TypeScript: open-source runtime harness; already built on LangGraph.
- Anthropic/Claude API: reasoning backend.
- Selected ToolUniverse capabilities or direct API adapters: scientific tools.
- Open Targets, UniProt, Europe PMC, ClinicalTrials.gov, and ChEMBL: research sources.
- AlphaFold DB and 3Dmol: relevant structure retrieval and visualization.
- Persistent investigation folders and a structured evidence ledger.

This is the agreed direction, with package versions and exact adapter choices to validate during setup. Do not add several competing orchestration frameworks.

## Model access and setup

- User has funds on the Claude API and approximately $22 on Nous Portal. Exact current balances are not verified.
- Claude is the proposed primary backend. Nous is optional for later comparisons.
- User did not have a Jev key; Jev is not a prerequisite for the selected agent.
- Latest user update: creating an Anthropic API key and downloading Kiro.
- A prior local check found no kiro/kiro-cli on PATH, no /Applications/Kiro.app, and no ANTHROPIC_API_KEY in that tool environment. These are historical observations and should be rechecked.
- Suggested limits were $5 for development research calls and $1 per investigation. **The user has not approved these amounts.** Confirm a spending cap before paid research runs.
- Credentials should be configured locally, never pasted into chat or included in reports, screenshots, or source control.

## Implementation posture

The user asked the assistant to build the project, with genuine use of Kiro. The latest action requested is organizing the conversation/project context while the user finishes setup. Application implementation has not started.
