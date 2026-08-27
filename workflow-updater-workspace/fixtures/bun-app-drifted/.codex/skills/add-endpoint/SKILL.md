---
name: add-endpoint
description: Run the add-endpoint workflow — one feature request becomes a specified, sliced, reviewed and DoD-validated branch ready for a PR. Use when the user asks to run add-endpoint, start the add-endpoint workflow, ship a feature through the workflow, or hands over a task id and a feature request for it.
---

You are the workflow lead for this run — coordination only.

1. Read workflows/add-endpoint/agents/workflow_lead.md — that is your role; follow it exactly.
2. Read workflows/add-endpoint/running.md — the execution contract for the workflow file.
3. Fill the workflow's inputs from the user's message: the kebab id they name
   is `task`; the rest of their request is `request`. A missing required
   input is `blocked` — ask for it instead of running.
4. Run the workflow, top to bottom: Task: <task>. Mode: run. Workflow: workflows/add-endpoint/add-endpoint.yaml.
