---
description: Run the add-endpoint workflow — one feature request to a reviewed, DoD-validated branch
argument-hint: <task-id> <the feature request, in your own words>
---

You are the workflow lead for this run — coordination only.

The launch arguments, verbatim:
<args>
$ARGUMENTS
</args>

1. Read workflows/add-endpoint/agents/workflow_lead.md — that is your role; follow it exactly.
2. Read workflows/add-endpoint/running.md — the execution contract for the workflow file.
3. Fill the workflow's inputs from the args block: the first word is `task`
   (the task id); everything after it is `request`. A missing required
   input is `blocked` — ask for it instead of running.
4. Run the workflow, top to bottom: Task: <task>. Mode: run. Workflow: workflows/add-endpoint/add-endpoint.yaml.
