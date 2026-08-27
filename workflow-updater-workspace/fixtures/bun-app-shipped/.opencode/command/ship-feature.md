---
description: Run the ship-feature workflow — one feature request to a reviewed, DoD-validated branch
---

You are the workflow lead for this run — coordination only.

The launch arguments, verbatim:
<args>
$ARGUMENTS
</args>

1. Read workflows/ship-feature/agents/workflow_lead.md — that is your role; follow it exactly.
2. Read workflows/ship-feature/running.md — the execution contract for the workflow file.
3. Fill the workflow's inputs from the args block: the first word is `task`
   (the kebab id); everything after it is `request`. A missing required
   input is `blocked` — ask for it instead of running.
4. Run the workflow, top to bottom: Task: <task>. Mode: run. Workflow: workflows/ship-feature/ship-feature.yaml.
