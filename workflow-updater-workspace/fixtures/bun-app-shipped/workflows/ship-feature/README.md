# ship-feature

One feature request becomes a branch that is specified, built in vertical
slices, reviewed, DoD-validated, and left ready for you to open the PR.

A `workflow_lead` agent runs `ship-feature.yaml` node by node; `running.md` is
the contract it executes by. Every artifact of a run lands under
`.awc/tasks/in-progress/<task>/` while it is live and moves to
`.awc/tasks/done/<task>/` when it finishes.

## How to launch

The run works in a git worktree, cut by the launch script:

```bash
./ship-feature.sh <task> claude "<the feature request, in your own words>"
```

`codex` and `opencode` take the place of `claude`. On a terminal the script
asks for the workflow name and branch prefix (defaults: `ship-feature` and
`task`); a headless run uses those defaults, or `AWC_NAME` and
`AWC_BRANCH_PREFIX`. Commit this package on the current branch before the
first run — the script cuts the tree from `HEAD`, and refuses to start unless
`workflows/ship-feature/ship-feature.yaml` is there. Re-running the script
resumes in the existing tree.

Already inside the checkout you want the run to write to, start it in session
instead: `/ship-feature <task> <request>` in Claude Code or opencode, or ask
Codex to run the ship-feature workflow with the same two values.

## Inputs

| Input | What it carries |
| --- | --- |
| `task` | an id of letters, digits, hyphens, or underscores, in any case — it names `.awc/tasks/in-progress/<task>/` and the branch |
| `request` | the feature request, in the requester's own words |

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
| `finish` | run | moves the task trail to `.awc/tasks/done/<task>/` | exit 0 |
| `commit-trail` | agent | commits the archived trail | `committed` |

A loop that hits its cap halts the run — that halt is the escalation, and it
names the node it stopped at.

## The agents

`agents/workflow_lead.md` coordinates and writes nothing. The rest do the work:
`story_partner` (the problem), `spec_partner` and `spec_reviewer` (the spec
bundle), `implementer_tdd` (both the tests and the code, by strict TDD),
`reviewer_slice` (a quick pass per slice), `reviewer_engineering` (the
exhaustive review), `dod_validator` (the final checklist), and `committer` (a
commit of exactly the paths it is handed).

## The scripts

- `scripts/check.sh` — the verification gate: typecheck, then the suite. Quiet
  when green, and a failure prints that tool's own output.
- `scripts/finish-task.sh` — moves `.awc/tasks/in-progress/<task>/` to
  `.awc/tasks/done/<task>/`.

## After a run

The branch is ready and the worktree stays where it is, so you can open the PR
yourself.
