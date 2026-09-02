# The change playbook

Each recipe below is one shape of change: what you edit, and — the part that
gets missed — what else has to move with it. Read the one that matches, then
check whether a second one also applies; "add mutation testing to a TDD
workflow" is the add-a-phase recipe with the pairing rules riding along.

Three habits run through all of them.

**Take agent text from the base**, never from your own prose:
`../workflow-creator/assets/agents/<agent>.md` is where a mode's rules live, and
the catalog's trimming rules tell you how to cut a mode in or out cleanly (the
bases mark each rule with the mode it belongs to).

**Diff the copy against its base before you take anything from it.** A packaged
agent is not just a trimmed base — it may carry hand-edits its owner made after
generation: a project fact, an extra check, wording they fixed. Those are the
reason the package is worth keeping, and pulling fresh text over them destroys
them silently. So every time a recipe says to re-instantiate or untrim, the
first step is that diff: list what the copy has that the base doesn't, decide
with the user which of it survives the change, and carry it across
deliberately. This is the
"change only what the request reaches" rule at the file level, and it applies to
every recipe below, not only the migration that says it out loud.

**Re-read the touched agent files at the end**, because the last step of almost
every recipe is "does every node still pass every argument its agent requires".

## Add a phase

1. Choose the agent: a base from the catalog, or a new file per the catalog's
   authoring rules. Instantiate it into `agents/`, trimmed to the modes this
   workflow's new nodes invoke.
2. Write the nodes from the catalog's canonical loop shape where one
   matches — a phase is rarely one node, and a phase built on an authored
   agent follows the same loop rules. Give the loop `max_iterations` and
   exactly one of `until:` / `until_run:`, and check that its **last** agent
   step is the one whose file emits the token, or the loop can never close.
3. Place it where its inputs exist: after whatever produces the artifacts it
   reads, before whatever consumes what it writes. A phase that writes to the
   task trail goes before the `finish` node.
4. Ripples:
   - agents that *validate the run* — a DoD validator, a final reviewer — may
     need the new phase's artifact added back to what they check, taken from
     their base.
   - new vars for any command the phase runs, in the failure-only variant.
   - the README's node walkthrough.
   - a `wait:` if the phase is `parallel: true` and anything later depends on it.

## Remove a phase

1. Delete its nodes.
2. Then sweep, in this order — each step can create the next one's orphan:
   - agent copies: trim the modes only those nodes invoked, including the
     `description:` line; delete the file outright if no node invokes it at all.
   - agents that validated the phase's artifacts: strip those checks, or every
     future run fails on a report nothing produces.
   - scripts nothing runs any more.
   - inputs and vars nothing fills.
   - `wait:` entries naming the removed nodes, and any `when:` predicate about
     them.
   - the README's walkthrough rows, and the launchers if an input went away.
3. Check what the removed phase used to *produce* for a later phase — a
   removed spec step means the build steps have no `subtask-N.md` to read.
4. Leave no scar tissue: the artifacts describe the workflow that exists now.

## Swap the build pairing

**TDD → split pairing.** Replace `implementer_tdd` with copies of
`implementer` and `unit_test_writer` from their bases, then rewrite the slice
loop to the catalog's split-pairing shape: a `cover-criteria` step after the
build step, a `cover-gaps` step routed from the review's findings file
(`Report:`), and the `fix-slice-findings` implementer step **last** so its
`DONE` closes the loop. Same for any later findings loop — in the split
pairing, a findings loop usually holds both fix steps. Delete
`agents/implementer_tdd.md` when no node invokes it.

**Split pairing → TDD.** The reverse: one `implementer_tdd` copy replaces both,
every `unit_test_writer` step comes out of every loop, and the loop's last step
is the TDD implementer's fix mode. Delete both old agent files. Watch for
`Report:` routing that only existed to feed `cover-gaps`.

Either way, check `test_command` / `commands` vars are still passed to the
agents that now run them.

## Add or remove mutation testing

Adding is the add-a-phase recipe with three specifics: the phase runs the tool
scoped to the task's changed files and captures its log in a `run:` step; the
loop ends on `until_run:` with a gate script reading that log, never on a
token; and `dod_validator` gets its `mutation.md` check back from its base.
The tool's log path becomes a var. Mutation tools refuse to start on a red
suite, so the round ends with a CI step.

Removing reverses all four — nodes, the gate and run scripts, the
`mutation_tester` copy, and the validator's check — and the `kill-mutants` mode
comes out of the implementer copy.

## Add, rename or remove an input

1. Edit `inputs:` and every `{{placeholder}}` that used it.
2. Then all four launch paths, which is the step that gets forgotten:
   `.claude/commands/<name>.md`, `.codex/skills/<name>/SKILL.md`,
   `.opencode/command/<name>.md`, and — worktree only — `./<name>.sh` (its
   usage line, its args block, and step 3 of the prompt it builds). Keep the
   mapping worded the same in all of them.
3. The two placeholder-substituting launchers carry their placeholder exactly
   once, inside its fenced slot: see `../workflow-creator/references/hosts.md`
   for the hazard and the templates.
4. The README's "how to launch", and the argument-hint frontmatter.
5. A new input that some agent reads is an argument in that node's `prompt:`,
   named the way the agent file expects it.

## Rename the workflow

Every one of these, or a run breaks: the folder `workflows/<name>/`, the YAML
file inside it and its `name:`, the three launcher filenames (and the Codex
skill's `name:` and directory), `./<name>.sh` at the repo root, every `run:`
path that names `workflows/<name>/scripts/...` — those are written from the
launch directory, so they carry the folder name — the README, and any prose
naming the workflow. Then grep the repo for the old name.

## Flip isolation

**In place → worktree.** Copy `../workflow-creator/assets/run.sh` to
`./<name>.sh`, fill `__WORKTREE_PARENT__`, `chmod +x`. `./agents-cli.conf` is
shared by every worktree launch script in the repo: copy
`../workflow-creator/assets/agents-cli.conf` there only when it is absent, and
leave the one already sitting there alone — another workflow's script is
reading it. Rewrite the README's "how to launch" for the script path, and say
that the package must be committed before the first run — the script refuses to
cut a tree unless the YAML is on `HEAD`. The YAML itself gains nothing: no
`git worktree` node, no `workdir:`.

**Worktree → in place.** Delete `./<name>.sh` and rewrite the README to the
slash-command and trigger-phrase path. Check for any node that assumed a fresh
tree. `./agents-cli.conf` is one file at the repo root that **every** worktree
launch script reads, so it goes only when this was the last one — check for
other `./*.sh` launch scripts before removing it, and leave it in place when
any remain.

Either way the in-session launchers are unchanged — they run from wherever the
host was started.

## Retarget the commands

When the repo's toolchain moved: update the vars, not the nodes, wherever the
command already lives in one. Take the failure-only variant of each new
command, verify each does one thing, and confirm each named script still
exists. Then check every agent invoked with `Commands:` is still passed
something it can run, and that a `run:` node's command is still one short line
rather than something that has grown into a script.

## Change a gate or a cap

A cap is a number in the YAML, but it is also a decision: hitting it is a halt,
which is the escalation, so a tighter cap is a feature and a looser one is a
request to let an agent keep going unsupervised. Say which way you're moving it
and why.

Adding a human sign-off is a `gate:` node or an approval loop — never a step
where an agent passes itself. Removing one means saying, in the plan, what now
goes unreviewed.

## Add a story step ahead of a spec step

A `spec_partner` step opens by reading `user-story.md` and halts as `blocked`
without it, so a package whose spec step is a `spec_partner` copy needs a
story node before it — a `story_partner` copy, or an authored agent that
writes the same `user-story.md` (an authored spec agent needs one only when
its own file reads that artifact). If the audit found that gap, this is the
fix. For a `story_partner` copy, choose the mode with the user —
`interview` (a loop, `Request:`), `capture` (a plain node, `Source:`, no token,
so it can never sit inside a loop), or `capture-and-confirm` (a loop,
`Source:` + `{{answer}}`) — instantiate the copy with only that mode, and match
the node shape to it. `capture` writes what it couldn't settle under
`## Open questions`, which the spec interview then asks first.

Swapping between the three modes later is the same work: re-instantiate the
copy from the base with the new mode, change the node's shape (loop ↔ plain
node) to match, and adjust the arguments — `Source:` must name a declared input
or var.

## Adopt the current task-trail layout

An older package writes a flat `.awc/tasks/<task>/` and ends without archiving.
The current layout puts `spec.md` and `acceptance-criteria.md` at the root of
`.awc/tasks/in-progress/<task>/`, everything else in `tmp/` beside them, and
moves the whole directory to `.awc/tasks/done/<task>/` in a final node. This
migration runs through every agent file at once, so do it as its own change:

1. Re-instantiate each agent copy from its base at the current paths, re-doing
   this package's mode trim on the fresh text. That is cleaner than editing
   paths in place, and it brings the copies up to date in the same pass — but
   the diff-against-the-base habit above matters most here: hand-edits
   the fresh text would bury are carried across deliberately, not lost.
2. Copy `../workflow-creator/assets/finish-task.sh` to
   `scripts/finish-task.sh`, `chmod +x`, and
   add the `finish` node running
   `workflows/<name>/scripts/finish-task.sh {{task}}` — the path written from
   the launch directory, since that is where a `run:` executes.
3. Place `finish` after every node that reads or writes the trail, including
   any `wait:` for parallel work that writes to it. Only a node touching no
   trail artifact may follow — a committer, a push.
4. If the workflow commits its trail, the committer node moves after `finish`
   and commits the archive move too.
5. Existing trails on disk are the user's call: leave them, or move them by
   hand. Say which you did.

## Adopt the verdict writer

Bases before the verdict writer had reviewers write their one-line verdict
file from prose — or nothing at all, leaving every `when:` guard grepping the
review trail and breaking whenever its verdict line moved. The current bases
record the verdict through `scripts/write-verdict-file.sh`:

1. Copy `../workflow-creator/assets/write-verdict-file.sh` to
   `scripts/write-verdict-file.sh`, `chmod +x`.
2. Re-instantiate the reviewer copies from their bases, re-doing this
   package's trim: each now requires a `Verdict-writer:` argument. The nodes
   invoking them pass the copied script's path, written from the launch
   directory, and grant the step `shell`.
3. A findings step that is a pure no-op on `APPROVED` — `fix-spec-findings`
   is the canonical one — takes the `when:` guard grepping the verdict file
   (the catalog's spec-review shape has it). A fix step that commits does
   not: the slice loop's closing commit and the review round's token ride on
   those steps whatever the verdict says.

## Add or tighten a tool scope

`allowed_tools:` goes on an `agent:` node or an agent step, and lists
capabilities (`read`, `search`, `edit`, `shell`, `web`, `spawn`). Read the
agent copy first and grant everything its file tells it to do: `Commands:`
needs `shell`, the reviewers' `Verdict-writer:` needs `shell` for its one
call, a report file needs `edit`, and every scope keeps `web`. The natural
candidates are steps that read and report — reviewers included, whose single
command is the verdict writer.
A scope drawn too tight halts the run as `blocked`, so when a change adds work
to an already-scoped agent, revisit its scope in the same pass.

## Replace an authored agent with a base (or the reverse)

A package sometimes carries a hand-written agent that a bundled base now
covers, or a base that has been hand-edited past recognition. Either swap is
fine, but it is a change of behavior, not a cleanup: diff the two, tell the
user what the run will do differently, and check the invocation arguments in
every node that calls it — the base's argument names are rarely the authored
one's.
