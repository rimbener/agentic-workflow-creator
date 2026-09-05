# The upgrade playbook

Each recipe below is one migration the audit can call for: what you edit, and
— the part that gets missed — what else has to move with it. Read the ones
that match the audit's upgrade group, then check how they interact; a package
from well before the current dialect usually needs several at once, and the
trail migration and the inline migration both rewrite the same agent copies,
so they land in one pass over each file rather than two.

Three habits run through all of them.

**Take agent text from the base**, never from your own prose:
`../workflow-creator/assets/agents/<agent>.md` is where a mode's rules live, and
the catalog's trimming rules tell you how to re-do this package's trim on the
fresh text cleanly (the bases mark each rule with the mode it belongs to).

**Diff the copy against its base before you take anything from it.** A packaged
agent is not just a trimmed base — it may carry hand-edits its owner made after
generation: a project fact, an extra check, wording they fixed. Those are the
reason the package is worth keeping, and pulling fresh text over them destroys
them silently. So every time a recipe says to re-instantiate, the first step is
that diff: list what the copy has that the base doesn't, carry it across
deliberately, and ask the user only about a line that contradicts the text the
base now carries. This is the "change only what the dialect reaches" rule at
the file level, and it applies to every recipe below, not only the migration
that says it out loud.

**Re-read the touched agent files at the end**, because the last step of almost
every recipe is "does every node still pass every argument its agent requires".

## Refresh a verbatim copy

`running.md` and `agents/workflow_lead.md` are copied unchanged from
`../workflow-creator/assets/`, and so are `scripts/finish-task.sh`,
`scripts/write-verdict-file.sh`, `./<name>.sh` (with `__WORKTREE_PARENT__`
filled) and `./agents-cli.conf` where the package has them. Any difference
the audit's `diff` shows is drift, and the fix is a recopy, `chmod +x` for the
scripts — a merge would only preserve the drift. Two of them are not local:
a stale `running.md` usually means the trail section is missing, so the trail
migration below rides along; a stale `workflow_lead.md` is the inline
migration's third step, and the run breaks without it whatever the YAML says.

## Adopt the current task-trail layout

An older package writes a flat `.awc/tasks/<task>/` and ends without archiving.
The current layout puts `spec.md` and `acceptance-criteria.md` at the root of
`.awc/tasks/in-progress/<task>/`, everything else in `tmp/` beside them, and
moves the whole directory to `.awc/tasks/done/<task>/` in a final node. This
migration runs through every agent file at once, so do it as its own pass:

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

## Move an interview onto an inline node

A package generated before `inline:` runs its interviews as loops: one spawn
per question, relayed through the agent's return and back as `{{answer}}`,
capped by `max_iterations`. The agent's protocol — ask, hear the answer,
choose the next question — cannot run that way. The migration lands in five
places:

1. The node: `loop:` becomes `inline:`, keeping `agent:`, `prompt:` and
   `expect:`. The `until:` token, the `max_iterations` cap and the
   `{{answer}}` argument all go — nothing is relayed, and the node ends on the
   agent's return line.
2. The agent copy: diff it against
   `../workflow-creator/assets/agents/<agent>.md` first (the habit above), then
   take the base's inline protocol — the log written at both ends of each
   exchange, the relaunch pickup, one return line with no `<promise>` token.
   A copy on the old protocol still treats every turn as a fresh agent and
   asks the human to repeat themselves.
3. `agents/workflow_lead.md`, recopied from
   `../workflow-creator/assets/agents/workflow_lead.md`. This one silently
   breaks the run: the lead file **outranks `running.md`**, and a copy from
   before `inline:` forbids its own writes — so the first file the interview
   creates comes back as
   `blocked -> <step>: asks the lead to write/edit/delete/commit`, with a
   correct YAML and `running.md` beside it. No package tailors the lead, so
   this is a copy, not a merge.
4. Everything downstream of the token: a `when:` or README row naming the
   loop's cap or signal, and any node that echoed an interview token such as
   `USER_STORY_WRITTEN` or `SPEC_BUNDLE_WRITTEN`.
5. The role stamp each launcher opens with — the three in-session launchers
   and, where it exists, `./<name>.sh`. The lead reads that line before its
   role file, so a bare "coordination only" contradicts the node it is about
   to run: take the wording from `../workflow-creator/references/hosts.md`,
   the same in all four. A launcher added in the same pass takes it too —
   never its siblings' stale stamp.

An approval loop is **not** this migration: each round is one self-contained
present-and-answer, closed by its own token, so it stays a loop.

## Restore a launcher

Every package ships all three in-session launchers, and they agree word for
word on the workflow, the inputs and the opening role stamp. A missing one is
written from `../workflow-creator/references/hosts.md` — its template, its
placeholder discipline (the Claude Code and opencode launchers carry their
placeholder exactly once, inside its fenced slot), and its current role stamp
— mapping the inputs the same way its siblings do. Then read the siblings
against the same template: a launcher written today must not copy their stale
wording, and they must not keep it either, so the three are brought up to the
current template together, with `./<name>.sh` where it exists. The Codex
launcher's `description:` describes what the workflow does; check it still
does.

## Add a story step ahead of a spec step

A `spec_partner` step opens by reading `user-story.md` and halts as `blocked`
without it, so a package whose spec step is a `spec_partner` copy needs a
story node before it — a `story_partner` copy, or an authored agent that
writes the same `user-story.md` (an authored spec agent needs one only when
its own file reads that artifact). This is the one migration that adds a
phase, and it adds it only because the dialect requires it. Choose the mode
with the user — `interview` (an `inline:` node, `Request:`), `capture` (a
plain spawned node, `Source:`, no token, so it can never sit inside a loop),
or `capture-and-confirm` (an `inline:` node, `Source:`) — instantiate the copy
with only that mode, match the node shape to it, and give the README's
walkthrough its row. `capture` writes what it couldn't settle under
`## Open questions`, which the spec interview then asks first. `Source:` must
name a declared input or var.

## Refresh a tool scope

`allowed_tools:` goes on an `agent:` node or an agent step, and lists
capabilities (`read`, `search`, `edit`, `shell`, `web`, `spawn`) — never on an
`inline:` node, where the lead runs the agent itself and there is no subagent
to scope. A scope written before a migration can now be too tight: a reviewer
copy that gained the verdict writer needs `shell` for its one call, a copy
that gained a report file needs `edit`, and every scope keeps `web`. So after
any recipe that refreshes an agent copy, read the copy and grant everything
its file now tells it to do — a scope drawn too tight halts the run as
`blocked`, and a scope on an `inline:` node is a finding to remove.

## Retarget the commands

Repo drift is the audit's independent group, not the dialect's — but it is
the most common reason someone comes back to a package they haven't run in a
while, so when the user accepts the finding: update the vars, not the nodes,
wherever the command already lives in one. Take the failure-only variant of
each new command, verify each does one thing, and confirm each named script
still exists. Then check every agent invoked with `Commands:` is still passed
something it can run, and that a `run:` node's command is still one short line
rather than something that has grown into a script.

## What is not a migration

A change that alters what the workflow does — a phase added or dropped, the
pairing swapped, mutation testing in or out, an input added, renamed or
removed, the workflow renamed, isolation flipped, a cap or gate moved, an
authored agent replaced with a base — has no recipe here, because it is not
drift and this session does not apply it. Name it for `awc <agent> --edit`
and leave it out of the plan. The one exception is above: a story step ahead
of a `spec_partner` step is a phase the dialect requires, so when the audit
finds it missing it is a migration in this playbook, offered to the user like
any other — the user asking for a phase is an edit; the checklist demanding
one is an upgrade.
