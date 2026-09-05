# Reading a package, and auditing it

Two passes over the same files. The **inventory** is what the package says
about itself; the **audit** is where it disagrees with the dialect, with the
repo, or with itself. Do both before you ask the user anything: the package answers
every question the creator's interview would have asked, and the audit is
what tells you — and them — what the upgrade actually is.

## Finding the package

A package is a `workflows/<name>/` folder holding `<name>.yaml` and
`running.md`. Around it, at the repo root: `.claude/commands/<name>.md`,
`.codex/skills/<name>/SKILL.md`, `.opencode/command/<name>.md`, and — only for
a worktree workflow — `./<name>.sh` and `./agents-cli.conf`.

Nothing found → the job is creation, not upgrade; hand over to the
workflow-creator skill. Several found → list them with their one-line
`description:` and ask which. A `workflows/` folder holding YAML that has no
`nodes:` list is someone else's format: say so rather than reshaping it.

## Inventory

Read the YAML first, then every file it references. What you are building is a
map you can hold the audit against.

**Identity and launch.** `name`, `description`, and the isolation mode —
worktree if `./<name>.sh` exists, in place otherwise. Which launchers exist.

**Inputs and vars.** Each `name`, its comment, and where it is used. Note vars
holding commands: those are the project facts the package was built around.

**Nodes.** One row per node, in order:

| id | type | what it invokes | how it exits |
| --- | --- | --- | --- |

Type is `run:`, `agent:`, `inline:`, `loop:`, `gate:` or `wait:`; note
`parallel: true`, `when:` and `allowed_tools:` as modifiers on the row. For a
loop, record its body's steps in order, its `until:` / `until_run:`, and its
`max_iterations`. For an `inline:` node, record that the lead runs the agent
itself, in conversation with the human — and anything the node carries beyond
`agent:`, `prompt:` and `expect:`, which is a finding. For an agent step,
record the `Mode:` and every other argument the prompt passes. This table is
what you present to the user in step 2.

**Agents.** For each file in `agents/`: which base it came from (or "authored
for this package" when it matches none), which modes the copy kept, which
arguments it requires, what it returns, and which nodes invoke it. The modes
that survived a trim are the ones that matter — a copy is not the base, and
assuming it is will have you invoking a mode that isn't there.

**Scripts.** For each file in `scripts/`: what it does, which node or agent
runs it (the verdict writer is named in a node's `Verdict-writer:` prompt
argument, not by a `run:`),
whether it is executable. Note any that no node and no agent runs.

**Artifacts.** What the agents write, and where: the current trail layout is
`.awc/tasks/in-progress/<task>/` with `spec.md` and `acceptance-criteria.md` at
its root and everything else in `tmp/`, archived to `.awc/tasks/done/<task>/`
by a `finish` node. Note what this package actually does — an older one may
write a flat `.awc/tasks/<task>/` and have no `finish` node at all.

**Runs on disk.** `ls .awc/tasks/in-progress/` — anything there is a run that
may be resumable, and it constrains node renames and removals. Also worth a
look: whether the package is committed (`git status` for its paths), since a
worktree workflow will not launch from an uncommitted YAML.

## Audit

### The checklist is the spec

Run the workflow-creator's validation checklist (in
`../workflow-creator/SKILL.md`) over the package as it stands. Every line of it
is a property a correct package has *now*, whenever it was generated — so
that pass is also the whole of "bring this old package up to date": whatever
the checklist currently demands and the package lacks is exactly the drift. It
never goes stale, because the checklist moves with the dialect.

Compare against the current bases while you're there:

- `diff` the package's `running.md` against
  `../workflow-creator/assets/running.md` — it should be byte-identical.
- `diff` any file the package copied from `../workflow-creator/assets/`
  (`finish-task.sh`, `write-verdict-file.sh`, `run.sh`, `agents-cli.conf`)
  against its base.
- `diff` `agents/workflow_lead.md` against
  `../workflow-creator/assets/agents/workflow_lead.md` — the one agent copied
  unchanged, so any difference is drift, and a stale lead blocks the nodes
  the rest of the package expects (an `inline:` node above all).
- Read each agent copy next to its base: a copy that is behind carries an older
  protocol, older artifact paths, or a `description:` naming modes it no longer
  has. A reviewer copy from before the verdict writer has no `Verdict-writer:`
  argument and records no one-line verdict file — see the playbook's "Adopt
  the verdict writer" for the migration. Every difference the diff shows that
  is the base's text rather than the owner's is a line of the upgrade.

### Upgrade-only checks

Things a freshly written package cannot have, so the creator's checklist never
looks for them:

- **Orphans.** An agent file no node invokes; a script nothing runs — no
  `run:` node, `until_run:`, `when:`, or reviewer `Verdict-writer:` names it
  (the verdict writer is exec'd from inside the reviewer step, its path
  passed in that node's prompt); an input or var no placeholder fills; a
  `wait:` naming a node that no longer exists or no longer carries
  `parallel: true`.
- **Dangling references.** An `agent:` or `run:` path that doesn't resolve; a
  `Verdict-writer:` argument naming a script the package doesn't contain; a
  `Report:` or `Log:` argument naming an artifact no node produces; a `Source:`
  naming an input that isn't declared.
- **Copy/node mismatch.** A node invoking a mode its agent copy was trimmed of,
  or a copy carrying a mode nothing invokes. Both directions matter: the first
  halts the run, the second confuses the next upgrade.
- **A conversation on the wrong node shape.** An agent whose file asks the
  human one question at a time — an interview above all — invoked from a
  `loop:` (or plain `agent:`) node rather than an `inline:` one: each spawn
  can ask once, through its return, so the protocol never runs as written.
  Every package from before `inline:` shows this; the playbook's "Move an
  interview onto an inline node" is the migration.
- **Launcher drift.** A missing launcher; launchers whose input mapping
  disagrees with each other or with `inputs:`; a launcher naming a workflow
  path that has since been renamed; a Codex skill whose `description:` no
  longer describes what the workflow does; an opening role stamp other than
  the one `../workflow-creator/references/hosts.md` gives — the lead reads it
  before its role file, so a bare "coordination only" contradicts the first
  `inline:` node.
- **Repo drift.** A var or node naming a command the repo no longer has — check
  the manifest's scripts, the CI config, and whether the named script files
  exist. This one is invisible until a run fails, and it is the most common
  reason someone comes back to a package they haven't run in a while.
- **Scar tissue.** Prose describing what the workflow used to do, left behind
  by an earlier change.

### Reporting it

Two groups, both short:

**The upgrade** — every line the creator's checklist demands and the package
lacks, and every copy that is behind its base, each named with the playbook
migration that lands it. This group is the job: it goes into the plan whole,
and it is not offered piecemeal.

**Independent** — everything else, one line each, with what fixing it would
touch: repo drift, orphans and scar tissue from an earlier change, a copy/node
mismatch the dialect never caused. Offer them; do not fold them in. The user
may want a package that runs today more than a package that is tidy, and they
are the one who has to review the diff.

Whatever the two groups hold, a request to change what the workflow does is
neither of them. If one arrived with the upgrade — "and add mutation testing
while you're in there" — the report names it as an edit for
`awc <agent> --edit` and leaves it out of the plan. That line is part of the
report whatever the audit found, and it is written before the report ends.

Then, if both groups are empty, say the package is current, in a sentence,
and stop — nothing is written, and the edit line above is already in the
user's hands. A long report on a healthy package buries the one line the
user needed.
