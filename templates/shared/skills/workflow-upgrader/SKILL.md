---
name: workflow-upgrader
description: Change a lead-run agentic workflow package that already exists in this repo — the workflows/<name>/ folder with its YAML, agents, scripts and launchers. Use whenever the user wants to add, drop or reshape a phase, swap agents or pairing, change inputs, isolation, commands, caps or gates, fix a workflow that halts or misbehaves mid-run, or bring an older generated package back in line with the current dialect — even if they only say "change my workflow", name a single node, or paste an error from a run.
---

# Workflow Upgrader

You change a **workflow package that already exists**: the `workflows/<name>/`
folder — its YAML of tiny nodes, the agent files those nodes invoke, the
single-purpose scripts, the execution contract, and the launchers that start a
run.

That is a different job from writing one. By the time someone wants a package
changed it has been committed, hand-edited, and run: it holds decisions from an
interview you weren't part of, project facts nobody will restate, and artifacts
from runs that may still be in flight. So the work is surgical — read what is
there, change what the request reaches, and leave the rest exactly as the
package's owner left it.

It is also a different job from **running** one. A request to land a change
in the *project* through the package — a task id plus a request, "use
`<name>` to build X" — changes nothing about the package: point the user at
its own in-session launcher (`.claude/commands/<name>.md` and its siblings),
or at `./<name>.sh` where the workflow runs in a worktree. This session
changes the package; it never runs it. And when the changes arrive already
decided — a named package, spelled-out edits, no appetite for an audit —
offer `awc <agent> --edit`, which opens a session on a skill that applies
exactly those; this session is for the user who wants the package walked and
audited first.

## Where your reference material lives

The dialect is not defined here: the **workflow-creator skill**, loaded in
this session alongside you, holds all of it. The two skills are staged as
sibling folders, so `../workflow-creator/` is that skill's folder when
resolved from this skill's own folder — the one your host named when it
loaded this file.

**Resolve the paths below against this skill's folder, exactly as you resolve
`references/inventory.md` — never against the repository you are working in.**
A `../workflow-creator/` under the user's repo is a different directory
entirely, and a read from the wrong one fails silently — it returns nothing
and looks like an empty file. If
a path does not open, find the workflow-creator skill's folder the way your host
exposes its loaded skills and read it from there; only if that skill is genuinely
not loaded is anything below unavailable.

Read these before starting (silently — they are your working knowledge):

- `../workflow-creator/assets/running.md` — the YAML dialect and execution
  contract. The package's own `running.md` should be a verbatim copy of it.
- `../workflow-creator/SKILL.md` — the package layout, the rules that make a
  workflow good, and the validation checklist. **That checklist is the spec
  your audit compares the package against**, so read it as the definition of a
  correct package rather than as history.
- `../workflow-creator/references/agent-catalog.md` — the bundled agent bases,
  their arguments and signals, how a copy is tailored (and untailored), the
  pairing rules, the canonical loop shapes, and the rules for authoring a new
  agent.
- `../workflow-creator/references/hosts.md` — the three launchers and the
  worktree launch script.
- `../workflow-creator/references/interview.md` — the full area list, for the
  areas your change reopens.
- `../workflow-creator/assets/` — the bases you instantiate from:
  `agents/*.md`, `run.sh`, `agents-cli.conf`, `finish-task.sh`.

Then read this skill's own references:

- `references/inventory.md` — how to read a package into a map, and the audit.
- `references/change-playbook.md` — what each kind of change ripples into.
- `references/interview.md` — the scoped interview.

If the workflow-creator skill is genuinely not loaded in this session — not
merely a path that failed on the first try — say so plainly before you start,
because you are then working degraded: the package's own `running.md` becomes
your contract, agent modes cannot be re-instantiated from their bases, and "is
this copy stale" has no answer. Name those three gaps to the user and let them
decide whether to restart the session with `awc <agent> --upgrade`, which loads
both skills, rather than quietly running an audit that cannot see its own spec.

## Process

1. **Locate.** Find the package: a `workflows/*/` folder holding a `.yaml` and
   a `running.md`. None → this is a creation job; hand it to the
   workflow-creator skill instead of improvising a package here. Several →
   ask which one, naming them.
2. **Inventory** per `references/inventory.md`: the nodes, inputs and vars, the
   agent roster with the modes each copy actually kept, the scripts, the
   launchers, the isolation mode, and any task trail on disk. Present the node
   table — it is the frame for the whole session, and it is how the user finds
   out you read the same package they have in mind.
3. **Audit** the package against the creator's validation checklist plus the
   upgrade-only checks in `references/inventory.md`. Report findings in two
   groups: what stands in the way of the requested change, and what is
   independent of it. **The user decides which of the second group to fix.**
4. **Interview** per `references/interview.md` — scoped to what the change
   touches, one question per turn with your recommendation. The package already
   answers most of the creator's areas; mine it before asking anything.
5. **Plan the change as a diff.** A table of every file you will add, edit,
   remove or leave alone, with the reason, plus the ripples from
   `references/change-playbook.md`, plus a before/after node list where the
   node sequence changes. **Get an explicit yes before writing files.**
6. **Apply** it — per the rules below and the playbook's recipes.
7. **Validate**: the creator's full checklist against the changed package, then
   the upgrade-only checks (no orphans, no dangling references, the launchers
   still agree, `running.md` still verbatim, new prose positive).
8. **Hand off**: what changed, what to commit before the next run, and anything
   the next run will ask of them differently.

## The rules that make an upgrade good

**The package is the record.** The YAML, the agent copies and the README are
what an earlier interview settled — isolation, pairing, formats, caps,
commands, and which artifacts exist. Read a decision out of the artifacts
rather than asking the user to recall it. Re-asking a settled question is the
main way an upgrade session wastes someone's time, and it invites an answer that
contradicts the package they already run.

**Change only what the request reaches.** Everything in the package is
someone's decision — including the parts that look like they could be tidier.
Hand-edits, project facts and locally authored agents are the reason a
generated package is worth keeping, and a drive-by rewrite destroys them while
burying the real change in an unreviewable diff. Improvements you spot go in
the audit report, for the user to accept or decline.

**A change ends where its ripples end.** Almost nothing here is a local edit.
Work the ripple list in `references/change-playbook.md` before declaring the
change applied; "What a change touches" below is the in-file orientation map.

**Untrimming is instantiation, not invention.** A packaged agent instantiated
from a base is a tailored copy, with modes and checks the workflow doesn't use
trimmed away (an authored agent has no base to untrim from). When your change
needs a trimmed mode or check back — mutation testing returning means
`dod_validator` must know `mutation.md` again — take the text from
`../workflow-creator/assets/agents/<agent>.md` per the playbook's opening
habits, never fresh prose, which leaves the copies slowly diverging from the
bases.

**Removal is not deletion.** Dropping a node leaves orphans behind — from a
stale mode in an agent copy to a launcher argument mapping. Sweep them per the
playbook's "Remove a phase" recipe, and check the agents that validate the
run especially — a DoD validator still demanding a report no node produces
now fails every run.

**The launchers move as one.** The three in-session launchers and the launch
script say the same thing in four wrappers. Any change to the workflow's name
or `inputs:` lands in all of them or the package starts behaving differently
depending on which host a teammate uses.

**A live run outranks a tidy diff.** A trail under `.awc/tasks/in-progress/`
means a run may be paused and resumable, and resuming works by node id. Before
renaming or removing nodes, check for one and tell the user what the change
does to it: finish the run first, or accept that it restarts.

**Upgraded artifacts still read positively.** The package describes what the
workflow does — not what it used to do. A removed phase leaves no scar tissue
("mutation testing removed", "no longer uses TDD") in the README, the YAML
comments or an agent prompt; it simply isn't there any more. The history of the
package lives in git, not in its prose.

**The skill's own files are never edited.** `../workflow-creator/assets/` are
bases you copy from. If a base itself looks wrong, say so — that is a change to
the awc repo, not to this user's package.

## What a change touches

The package's shape, for orientation while you inventory (the authority is the
creator's SKILL.md):

```
<name>.sh                       # worktree launch only — copy of the base run.sh
agents-cli.conf                 # worktree launch only — copy, never edited
workflows/<name>/
├── <name>.yaml        # the workflow
├── README.md          # purpose, node walkthrough table, how to launch
├── running.md         # execution contract — verbatim copy of the base running.md
├── agents/            # workflow_lead.md + every agent the nodes reference
└── scripts/           # one script = one thing; chmod +x
.claude/commands/<name>.md      # in-session launcher — Claude Code
.codex/skills/<name>/SKILL.md   # in-session launcher — Codex
.opencode/command/<name>.md     # in-session launcher — opencode
```

A change to the **node list** reaches the YAML, the README's walkthrough, and
the agent copies whose modes or checks the change adds or strips.
A change to **`inputs:` or the workflow's name** reaches all three launchers,
the launch script, the README, and every `{{placeholder}}` in the YAML.
A change to **isolation** adds or removes `./<name>.sh` and rewrites the
README's "how to launch"; `./agents-cli.conf` is shared with every other
worktree launch script in the repo, so it arrives only when absent and leaves
only with the last of them.
A change to **commands** reaches the vars, the nodes that pass `Commands:`, and
any script wrapping them.
Bringing a package **up to date** reaches `running.md`, and whatever the
creator's checklist finds — the trail layout under `.awc/tasks/` most often,
because it runs through every agent file at once.

## Validation (before handoff)

Run the creator's validation checklist over the whole changed package, not just
the nodes you touched — a ripple you missed shows up there. Then these, which
only an upgrade can fail:

- **No orphans.** Every file in `agents/` is referenced by a node; every file
  in `scripts/` is run by a node, an `until_run:`, or a `when:`; every input
  and var is used by some `{{placeholder}}`; every `wait:` names a node that
  still exists and still carries `parallel: true`.
- **No dangling references.** Every `agent:` path, `run:` script path and
  `Report:`/`Log:`/`Source:` argument names something the changed package
  actually produces or contains.
- **Agent copies match the new node list in both directions** — no mode no node
  invokes, and no node invoking a mode its agent copy no longer carries. Check
  each changed copy's `description:` too: it names the modes the file has.
- **`running.md` is byte-identical** to `../workflow-creator/assets/running.md`
  (`diff` them), and any file copied from `../workflow-creator/assets/` is
  verbatim and executable.
- **The four launch paths agree**: the three in-session launchers and, where it
  exists, `./<name>.sh` name the same workflow, map the same inputs, and match
  the YAML's `inputs:` list.
- **The diff is the change.** Read `git diff` for the package end to end: every
  hunk traces to a line in the plan the user approved. A hunk that doesn't is
  either a ripple you should name or a drive-by you should drop.
- **New prose reads positively**, and no artifact describes the workflow's
  previous shape.

Then walk the changed node list once as the lead would run it — including a
resume from the middle, if a trail is sitting under `.awc/tasks/in-progress/`.

Hand off with: the node table as it now stands, the files touched, what needs
committing before the next run (a worktree workflow refuses to start unless its
YAML is on `HEAD`), and any decision the user deferred in the audit.
