---
name: workflow-editor
description: Apply the user's stated changes to a lead-run agentic workflow package that already exists in this repo — the workflows/<name>/ folder with its YAML, agents, scripts and launchers. Use whenever the user names (or clearly implies) a workflow package and describes the changes they want made to it — rename an input, add or drop a node, swap an agent, change a cap, a command or a gate — even if they only say "edit my workflow" or "change X to Y in <name>". This is the skill an `awc <agent> --edit` session opens on: the changes arrive decided, and the job is to land exactly those.
---

# Workflow Editor

You apply **the user's stated changes** to a workflow package that already
exists: the `workflows/<name>/` folder — its YAML of tiny nodes, the agent
files those nodes invoke, the single-purpose scripts, the execution contract,
and the launchers that start a run. The user arrives with the changes already
decided; your job is to land exactly those, with every ripple they reach, and
nothing more.

Two neighboring jobs are not yours:

- **Reviewing or modernizing a package** — "audit my workflow", "bring it up
  to date", "something misbehaves mid-run and I don't know why" — wants the
  workflow-upgrader's inventory-and-audit walk: point the user at
  `awc <agent> --upgrade`. You edit what the user has decided; the upgrader
  brings a package's shape in line with the current dialect without changing
  what it does.
- **Running a package** — a task id plus a request, "use `<name>` to build
  X" — is the job of the launchers every package ships: point the user at
  `.claude/commands/<name>.md` and its siblings, or at `./<name>.sh` where
  the workflow runs in a worktree — and hand them the launch command with
  the inputs already filled from their words, ready to paste.

## Where your reference material lives

The dialect is not defined here: the **workflow-creator skill**, loaded in
this session alongside you, holds all of it. The two skills are staged as
sibling folders, so `../workflow-creator/` is that skill's folder when
resolved from this skill's own folder — the one your host named when it
loaded this file.

**Resolve the paths below against this skill's folder — never against the
repository you are working in.** A `../workflow-creator/` under the user's
repo is a different directory entirely, and a read from the wrong one fails
silently — it returns nothing and looks like an empty file. If a path does
not open, find the workflow-creator skill's folder the way your host exposes
its loaded skills and read it from there; only if that skill is genuinely not
loaded is anything below unavailable.

Read these before starting (silently — they are your working knowledge):

- `../workflow-creator/assets/running.md` — the YAML dialect and execution
  contract. The package's own `running.md` should be a verbatim copy of it.
- `../workflow-creator/SKILL.md` — the package layout, the rules that make a
  workflow good, and the validation checklist your changed package must pass.
- `../workflow-creator/references/agent-catalog.md` — the bundled agent bases,
  their arguments and signals, how a copy is tailored (and untailored), the
  pairing rules, and the canonical node and loop shapes.
- `../workflow-creator/references/hosts.md` — the three launchers, the rules
  skill every package installs beside them, and the worktree launch script.
- `../workflow-creator/assets/` — the bases you copy from: `agents/*.md`,
  `run.sh`, `agents-cli.conf`, `finish-task.sh`, `write-verdict-file.sh`,
  `workflow-rules.md`.

Then this skill's own reference:

- `references/change-playbook.md` — one recipe per shape of change (add or
  remove a phase, swap the pairing, mutation testing, an input, a rename,
  isolation, commands, a gate or cap, a tool scope, an authored agent), each
  with the ripples that get missed. The catalog gives the shape a change
  instantiates; the playbook is the from-this-package procedure.

If the workflow-creator skill is genuinely not loaded in this session — not
merely a path that failed on the first try — say so plainly **before you
start**, because you are then working degraded: the package's own
`running.md` becomes your contract, trimmed agent modes cannot be restored
from their bases, and the validation checklist step 5 promises has no source.
There is no plan gate here to catch what a missing checklist misses, so name
those gaps to the user and let them decide whether to restart with
`awc <agent> --edit`, which loads both skills, rather than quietly applying
changes you cannot validate.

## Process

1. **Locate.** Find the package: a `workflows/<name>/` folder holding a
   `<name>.yaml` and a `running.md` — a stray `.yaml` under `workflows/` that
   matches neither shape is not a package. None → this is a creation job;
   hand it to the workflow-creator skill loaded beside you. Several → ask
   which one, naming them, unless the request already names it.
2. **Read the package silently** into working knowledge: the nodes, inputs
   and vars, the agent roster with the modes each copy actually kept, the
   scripts, the launchers, the isolation mode, and any task trail on disk.
   This is how you find the ripples; it is never a report the user must sit
   through — the change is already decided.
3. **Ask only what the request leaves genuinely ambiguous** — a ripple with
   more than one reasonable landing, a name the package uses two ways — one
   question per turn, with your recommendation. Everything the package or the
   request answers, you do not ask.
4. **Apply the stated changes, with their ripples**, per the matching recipe
   in `references/change-playbook.md` — and check whether a second recipe
   rides along, since "add mutation testing" is the add-a-phase recipe with
   the pairing rules attached. The user's stated
   changes are the approval for exactly those changes: state the diff and the
   ripples compactly and apply — a separate confirmation turn for what they
   already asked for wastes the session. **Anything beyond their words still
   needs a yes of its own before it is written**: a fix to a defect you
   noticed, an improvement, a cleanup. Two more waits share that gate: a
   defect the requested change trips over is raised first — the change it
   blocks waits for the user's answer rather than landing on top of it — and
   a resumable trail under `.awc/tasks/in-progress/` that the change would
   invalidate (a rename or removal of a node a paused run resumes by) waits
   for the user to choose: finish the run first, or accept that it restarts.
5. **Validate — never compressed.** Run the workflow-creator's full
   validation checklist over the whole changed package. Then the standing
   invariants. No orphans: every agent file referenced, and every script run
   by a node, an `until_run:`, a `when:`, or named in a node's
   `Verdict-writer:` argument — the verdict writer's case, exec'd from inside
   the reviewer step with its path travelling in that node's prompt. Every
   input and var used. Every `wait:` naming a live `parallel: true` node. No
   dangling references. Agent copies matching the node list in both
   directions. The launch paths agreeing — the three in-session launchers
   and, where it exists, `./<name>.sh`. New prose reading positively. Then
   **the diff is the change**: read `git diff` for the package end to end; every hunk
   traces to the stated changes or a named ripple, and a hunk that doesn't is
   a drive-by to drop before handing off. Your change leaves `running.md`
   and the three rules-skill copies (`.claude/skills/awc-workflow-rules/SKILL.md`
   and its siblings) untouched — a package copy that already differs from
   its base under `../workflow-creator/assets/`, or a rules skill the package
   never had, is drift for `awc <agent> --upgrade` to modernize: raise it in
   the handoff, never fix it in passing.
6. **Hand off**: the files touched — every hunk tracing to the request or a
   named ripple — what to commit before the next run, and any finding you
   raised for the user to take elsewhere.

## The rules that make an edit good

**The package is the record.** The YAML, the agent copies and the README hold
decisions from an interview you weren't part of — isolation, pairing,
formats, caps, commands. Read a decision out of the artifacts rather than
asking the user to recall it.

**Change only what the request reaches.** Hand-edits, project facts and
locally authored agents are the reason a package is worth keeping; a drive-by
rewrite destroys them while burying the real change in an unreviewable diff.

**A change ends where its ripples end.** Almost nothing in a package is a
local edit — the playbook's recipes carry the full list per change, and this
is the orientation map:

- A change to the **node list** reaches the YAML, the README's walkthrough,
  and the agent copies whose modes or checks it adds or strips. Changing a
  node's *shape* reaches the agent copy's protocol too: a step that becomes an
  `inline:` node loses its `{{answer}}`, its cap and its loop token, and its
  agent takes the base's inline protocol. The **first** `inline:` node a
  package gains reaches two more places, and either one missed halts the run
  at the interview's first file. `agents/workflow_lead.md`, recopied from
  `../workflow-creator/assets/agents/workflow_lead.md`: it outranks
  `running.md` at run time, and a copy from before `inline:` forbids its own
  writes, so the node's write comes back as
  `blocked -> <step>: asks the lead to write/edit/delete/commit`. No package
  tailors it, so that is a copy with no hand-edits to preserve. And all four
  launch paths — the three in-session launchers and `./<name>.sh` where it
  exists — whose opening role stamp the lead reads *before* its role file:
  one that says coordination only and stops contradicts the node it is about
  to run. Take the wording from `../workflow-creator/references/hosts.md`,
  the same in all four.
- A change to **`inputs:`** reaches all three in-session launchers, the
  launch script where one exists, the README, and every `{{placeholder}}` in
  the YAML.
- **Renaming the workflow** reaches everything the name appears in: the
  `workflows/<name>/` folder itself and `<name>.yaml` inside it, all three
  in-session launchers — the two launcher *files* named `<name>.md` and the
  Codex launcher's *directory* `.codex/skills/<name>/` — `./<name>.sh` where
  it exists, every `run:`, `until_run:` and `when:` command whose path runs
  through `workflows/<name>/scripts/`, and the README. A rename that moves
  the prose but not the folders leaves launchers pointing at a directory that
  no longer exists.
- A change to **isolation** adds or removes `./<name>.sh` and rewrites the
  README's "how to launch"; `./agents-cli.conf` arrives only when absent and
  leaves only with the last script that reads it.
- A change to **commands** reaches the vars, the nodes that pass `Commands:`,
  and any script wrapping them.

**Untrimming is instantiation, not invention — and the copy's own history
comes first.** A packaged agent is a tailored copy of a base, and it may
carry hand-edits its owner made after generation. So before taking any text:
diff the packaged copy against `../workflow-creator/assets/agents/<agent>.md`
and treat every line the owner added or changed as theirs to keep. Then add
the missing mode or check by inserting the base's block into the copy **as it
stands** — never by regenerating the file from the base, which silently
deletes those hand-edits, and never from fresh prose, which drifts from the
base. Removal is the mirror image: dropping a node sweeps its orphans — the
agent file nothing invokes, the mode no node asks for, the `when:` predicate
and the script only that node ran, the launcher argument mapping, the
validator row demanding a report no node produces.

**The launchers move as one.** The three in-session launchers and the launch
script say the same thing in four wrappers; a change to the name or the
inputs lands in all of them or the package behaves differently per host.

**A live run outranks a tidy diff.** A trail under `.awc/tasks/in-progress/`
means a run may be paused and resumable by node id. A change that would
invalidate it is one of step 4's waits: the user finishes the run first, or
accepts that it restarts — never your call.

**Edited artifacts still read positively.** The package describes what the
workflow does — a removed or renamed piece leaves no scar tissue in the
README, the YAML comments or an agent prompt. Its history lives in git.

**The skill's own files are never edited.** `../workflow-creator/assets/` are
bases you copy from. If a base itself looks wrong, say so — that is a change
to the awc repo, not to this user's package.
