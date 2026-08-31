---
name: workflow-runner
description: Land a change in this repo by running the lead-run agentic workflow package it already has — the workflows/<name>/ folder with its YAML, agents and scripts. Use whenever the user describes work they want done in the project — a feature, a fix, a refactor, a task id with a request — even if they never say "workflow" or name the package: locating the package, filling its inputs from the conversation and leading the run is this skill's job.
---

# Workflow Runner

You run a **workflow package that already exists**, to land a change in the
project it lives in. The user brings the change they want — a feature, a fix,
a refactor — and you execute it *through* the package's workflow: its agents
do the work, its gates ask the human, its scripts and caps hold. The change
reaches the project's code only by way of the workflow's own nodes.

Two jobs look similar and are not yours:

- **Writing a new workflow** is the workflow-creator's. No package in the
  repo means there is nothing to run — say so and point the user at
  `awc <agent>`, which loads that skill.
- **Changing the package itself** — add a phase, swap an agent, fix a node —
  is the workflow-upgrader's. Point the user at `awc <agent> --upgrade`. In
  this session the package is read-only, down to a single line: a package you
  patch mid-run is a package whose next run nobody can predict.

## The package is the contract

Everything that defines the run ships inside the package, and you read it
from there:

- `workflows/<name>/agents/workflow_lead.md` — your role for the run, and the
  hard rules that outrank everything else.
- `workflows/<name>/running.md` — the execution contract: what every node
  type means, how loops close, how questions reach the human, how a run halts
  and resumes.

Read both from the package, never from memory of another workflow — the YAML
was written against the copies sitting beside it, and a package generated
earlier may follow an older contract than the one you last saw. This skill
adds only what those files cannot: finding the package, turning a
conversational request into its inputs, and starting from the right place.

## Process

1. **Locate the package.** A package is a `workflows/<name>/` folder holding
   a `<name>.yaml` and a `running.md`. None in the repo → this is a creation
   job; hand the user to `awc <agent>` rather than improvising nodes here.
   Several → ask which one, naming them; recommend one only when the request
   plainly fits it.
2. **Read your role and the contract** — `agents/workflow_lead.md`, then
   `running.md`, in that order. From here on you are the workflow lead, and
   those two files govern the run.
3. **Fill the inputs.** The YAML's `inputs:` list is what the run starts
   with. The change the user described is the request-shaped input, passed in
   their words — never reworded, widened, or narrowed. An id-shaped input
   (`task`) names the task trail and often a branch, so take it from the user
   or agree one with them. A required input the conversation has not supplied
   is a question, never a guess. Settle these before deciding where the run
   happens — the next step needs them.
4. **Place the run.** A `./<name>.sh` at the repo root means this is a
   worktree workflow: runs belong in a worktree that script creates. Where
   the run happens is the user's choice, and it may already be made:
   - This session is already inside a worktree — nothing to decide; run
     where you are. Check for real, not by feel: in a linked worktree `.git`
     is a *file*, not a directory. The branch here should be
     `<prefix>/<task>` — the script's prefix defaults to `task` unless it was
     launched with another — so a matching branch also tells you which task's
     tree you are in; a worktree on a different task's branch is worth a
     question before writing into it.
   - The user has already chosen to run in the main checkout — "skip the
     worktree", "run it here" — then that is consent: name once what it
     forfeits (the isolation the package was designed around, every write
     landing on the current branch) and carry on to the next step. Do not
     hand them the script they just declined.
   - Otherwise, hand them the launch command with the inputs from step 3 and
     this session's own host filled in — `./<name>.sh <task> <host>
     "<request>"`, ready to paste — and let them choose between it and
     running in place here. Execute nothing until they have. And if they take
     the script, this session's job is **done**: the script starts its own
     host session inside the tree and the run happens there — never also walk
     the YAML here, which would be the second, unisolated run of the same
     task.
   No `./<name>.sh` means an in-place workflow: run where you are.
5. **Check for a live trail.** A directory under
   `.awc/tasks/in-progress/<task>/` means an earlier run may be paused —
   follow `running.md`'s resume rules: confirm the resume point against what
   is actually on disk, and never redo completed work that created commits.
   The same trail under `.awc/tasks/done/<task>/` means the task already
   finished — say so instead of running it again.
6. **Confirm, then run.** Restate the plan in a line or two — which workflow,
   the task id, the filled inputs, where the writes will land — and get a
   yes. Then run it exactly as the package's own launchers would:
   `Task: <task>. Mode: run. Workflow: workflows/<name>/<name>.yaml.`,
   walking the YAML top to bottom per `workflow_lead.md` and `running.md`.

## The rules that make a run worth having

**The workflow is the process, not a suggestion.** The user wrote it — or had
it generated — precisely so that this kind of change gets its interview, its
review, its gates. Doing the change directly because it looks small is the
one failure this session exists to prevent: it produces the edit without any
of the assurances the user set up the workflow to get. A user who wants the
change made without the workflow does not need this session for it — say so
rather than quietly bypassing the run.

**The human's words travel verbatim.** The request goes into the run as the
user gave it, and a question or gate coming back out is relayed in the
agent's words, per the contract. Both directions: never answer for the human,
never paraphrase them to an agent.

**A halt is a report, not a repair.** When a node fails, an agent blocks, or
a loop hits its cap, report it exactly as `workflow_lead.md` prescribes and
stop. If the cause is the package itself — a node naming an agent file that
does not exist, a script that is not executable, a contract the agents no
longer follow — name the finding and point at `awc <agent> --upgrade`. You
fix a run by resuming it, never by editing the package it runs from.

**The trail is the workflow's.** Artifacts under `.awc/tasks/` are written,
moved and archived by the workflow's own agents and scripts, per the
contract. You never relocate, rename, or delete one.
