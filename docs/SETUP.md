# Setup and Kiro handoff

## Current handoff

The user is downloading Kiro and creating an Anthropic API key. Do not start paid research runs until runtime access and a spending limit are established.

## Open the project

Open this EvidenceLens folder in Kiro. Read README.md, then PROJECT_BRIEF.md and CONVERSATION_SUMMARY.md before implementation. Use Kiro to produce or refine the feature specification, implement the application, and run meaningful checks.

The latest accepted UI is a single independent agent with an otter mascot, a goal field, truthful stage activity, and folders of visual research results. Earlier SaaS/observatory mockups are superseded.

## Configure the API key locally

The .env.example file contains an empty ANTHROPIC_API_KEY placeholder. Copy it to .env.local and enter the key locally. The local file is ignored by the provided .gitignore.

- Do not paste keys into chat.
- Do not expose the key through a NEXT_PUBLIC_ variable.
- Make provider requests from the server side.
- Do not include credentials in reports, run manifests, screenshots, logs, or commits.
- Environment-file presence does not prove successful model access. Perform one minimal authenticated request after the spending cap is approved.

## Confirm before paid execution

- Remaining hackathon time and submission requirements.
- Total development model-call budget and per-investigation limit.
- A current tool-calling Claude model available to the account.

Previously suggested limits: $5 total development research calls and $1 per investigation. These are proposals, not approved budgets.

## First implementation checkpoints

1. Start the app and confirm Kiro can implement and test changes.
2. Smoke-test the chosen model and each selected scientific adapter.
3. Implement the evidence ledger and persistent investigation folder.
4. Execute one bounded historical research case with source-linked output.
5. Add the otter/stage interface and the three relevant visualizations.
6. Verify report references, model/sequence identity, unknowns, duplicate studies, and stop/budget behavior.

No production implementation, dependency installation, deployment, or research run has been performed as part of preparing this folder.
