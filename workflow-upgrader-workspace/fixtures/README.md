# Eval fixtures — workflow-upgrader

The upgrader's fixtures are target repos that **already hold a generated
workflow package**, since an upgrade session starts from one. An eval run copies
a fixture into its run directory and runs `git init && git add -A && git
commit` in the copy — the packages exercise git operations (worktrees,
commits), and a worktree workflow refuses to launch unless its YAML is on
`HEAD`.

## `bun-app-shipped`

The `bun-app` fixture from `workflow-creator-workspace/fixtures/`, plus a
`ship-feature` package generated against the **current** dialect: the
`.awc/tasks/in-progress/<task>/` trail with `tmp/`, a `finish` node running
`scripts/finish-task.sh`, `story_partner` in `interview` mode and the spec
interview both on `inline:` nodes the lead runs itself, and agent copies
tailored to the nodes that invoke them.

It is the baseline — a package with nothing wrong with it. For the upgrader
that is the point: an audit of it is clean, so its evals grade that a current
package is reported as current and left byte-identical, and that an
edit-shaped ask is handed to `awc <agent> --edit` rather than applied. The
editor's evals borrow it too (`../workflow-editor-workspace/`), so that an
eval asking for a change grades the change, not a cleanup. What it
deliberately does **not** have is what the editor's changes ask for:

| The package has | So an eval can ask for |
| --- | --- |
| a TDD slice loop (`implementer_tdd`, no `unit_test_writer`) | the split pairing, which rewrites every loop |
| a `dod_validator` trimmed of `mutation.md`, an `implementer_tdd` without `kill-mutants` | mutation testing, which has to *untrim* both from their bases |
| two inputs (`task`, `request`) | a third, which ripples into all three launchers and `ship-feature.sh` |
| worktree isolation (`ship-feature.sh` + `agents-cli.conf`) | running in place, or a rename across nine paths |
| an exhaustive review round, a spec review, a DoD loop | dropping a phase and sweeping its orphans |
| an authored `committer` agent the catalog has no base for | a change that must not clobber a hand-written agent |

Verified as generated: the YAML parses with one behavior per node, every agent
and script path resolves, `running.md` is byte-identical to the skill's,
`check.sh` runs green and silent against the fixture, and `ship-feature.sh`
refuses both an uncommitted package and a task id with anything outside
letters, digits, hyphens, and underscores.

## `bun-app-drifted`

The same repo holding an `add-endpoint` package generated **before** several
dialect changes, for the "bring this up to date" eval. It runs in place, and it
is behind in five ways the current validation checklist catches on its own — no
version list needed, which is the point:

| Drift | What the checklist says now |
| --- | --- |
| a flat `.awc/tasks/<task>/` trail | artifacts live under `.awc/tasks/in-progress/<task>/`, with `tmp/` for all but the approved pair |
| no `finish` node, no `finish-task.sh` | a workflow writing that trail archives it in a final node |
| `running.md` predating the trail section | the package's copy is verbatim |
| no `.opencode/command/` launcher | all three in-session launchers exist and agree |
| its interviews as `loop:` nodes relaying `{{answer}}` per question | a step that converses with the human is an `inline:` node the lead runs itself |

It also carries two **hand-edits its owner made after generation** — a
route-registration lens on `reviewer_slice`, a route-coverage row on
`dod_validator`, neither of which is in any base. Re-instantiating those agents
from their bases without diffing first deletes both silently, which is exactly
what the eval grades.
