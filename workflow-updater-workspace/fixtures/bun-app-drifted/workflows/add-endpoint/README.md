# add-endpoint

One endpoint request becomes a change that is specified, built in vertical
slices, reviewed and DoD-validated on the current branch.

A `workflow_lead` agent runs `add-endpoint.yaml` node by node; `running.md` is
the contract it executes by. Every artifact of a run lands under
`.awc/tasks/<task>/`.

## How to launch

From the checkout you want the run to write to:

```
/add-endpoint <task> <the endpoint request, in your own words>
```

In Claude Code that is the slash command; in Codex, ask it to run the
add-endpoint workflow with the same two values.

## Inputs

| Input | What it carries |
| --- | --- |
| `task` | a kebab id — it names `.awc/tasks/<task>/` |
| `request` | the endpoint request, in the requester's own words |

## What the run does

| Node | Type | What happens | How it exits |
| --- | --- | --- | --- |
| `install` | run | `bun install --silent` | exit 0 |
| `story` | loop | a story interview, one question per turn, writes `user-story.md` | `USER_STORY_WRITTEN`, cap 20 |
| `spec` | loop | a spec interview, writes the bundle with plain acceptance criteria | `SPEC_BUNDLE_WRITTEN`, cap 30 |
| `spec-review` | agent | automated review of the bundle → `review-spec.md` | `APPROVED` / `CHANGES_REQUESTED` |
| `spec-fixes` | agent | resolves every finding the review raised | `findings_resolved` |
| `spec-approval` | loop | you read the spec and criteria and approve them | `SPEC_APPROVED`, cap 10 |
| `commit-spec` | agent | commits the approved spec and criteria | `committed` |
| `build` | loop | one vertical slice per iteration: TDD build, check, quick review, fixes | `DONE` (all slices), cap 6 |
| `review-round` | loop | check, exhaustive engineering review, fixes, check again | `DONE` (every finding resolved), cap 2 |
| `dod` | loop | the Definition of Done re-validated, gaps closed | `DONE` (all-pass), cap 2 |
| `ship-gate` | gate | you review the diff and approve the finish | your approval |
| `commit-trail` | agent | commits the task trail | `committed` |

A loop that hits its cap halts the run — that halt is the escalation, and it
names the node it stopped at.

## The agents

`agents/workflow_lead.md` coordinates and writes nothing. The rest do the work:
`story_partner` (the problem), `spec_partner` and `spec_reviewer` (the spec
bundle), `implementer_tdd` (both the tests and the code, by strict TDD),
`reviewer_slice` (a quick pass per slice, including this repo's route
registration check), `reviewer_engineering` (the exhaustive review),
`dod_validator` (the final checklist), and `committer` (a commit of exactly the
paths it is handed).

## The scripts

- `scripts/check.sh` — the verification gate: typecheck, then the suite. Quiet
  when green, and a failure prints that tool's own output.
