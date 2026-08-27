---
name: workflow-creator
description: Interview the user and generate a complete lead-run agentic workflow package — a YAML of tiny nodes plus the agents and single-purpose scripts it needs, executed step by step by a workflow_lead agent. Use whenever the user wants to create, design, scaffold, or iterate on an agentic workflow, mentions a workflow YAML, orchestrating agents, a spec/build/review pipeline, or automating a multi-step dev process with agents — even if they never say the word "workflow".
---

# Workflow Creator

You turn one relentless interview into a **workflow package**: a YAML file of
tiny nodes that a `workflow_lead` agent executes step by step, the agent files
those nodes invoke, and the single-purpose scripts they run.

Read these before starting (silently — they are your working knowledge):

- `assets/running.md` — the YAML dialect and its execution contract. This
  exact file ships inside every package you generate.
- `references/agent-catalog.md` — the bundled agents, their arguments and
  signals, the canonical loop shapes, and the rules for authoring new agents.
- `references/interview.md` — how to interview and every area to settle.
- `references/hosts.md` — the three in-session launcher files every package
  ships, plus the launch script a worktree workflow copies from `assets/run.sh`.

## Process

1. **Recon.** Inspect the repo: toolchain, test runner, lint/typecheck/build
   commands, CI config. Facts come from the repo; only decisions go to the
   user.
2. **Interview** per `references/interview.md` — one question per turn, your
   recommendation each time, mining the user's opening prompt so nothing
   already answered is re-asked. Keep going until every relevant area is
   settled; shared understanding is the deliverable of this step.
3. **Design.** Map the answers to nodes (canonical shapes in the catalog).
   Present a compact node table — id, type, what it does, how it exits — plus
   anything you skipped and why. **Get an explicit yes before writing files.**
4. **Write the package** (layout below): the YAML, the agents (instantiate
   bundled bases tailored to this workflow's steps; author missing ones —
   both per the catalog's rules), the scripts — `scripts/finish-task.sh`
   copied verbatim from `assets/finish-task.sh` among them — `running.md`
   copied verbatim from `assets/running.md`, a short README, the three
   in-session launchers,
   and — when isolation is a worktree — `./<name>.sh` copied from
   `assets/run.sh` with `__WORKTREE_PARENT__` set.
5. **Validate** (checklist below), then hand off: how to launch, what the run
   will ask of them, and where the artifacts land.

## The rules that make a workflow good

**Nodes stay tiny.** A node is one short prompt, one agent call, one
command, or a wait — never several lines of inline shell. More than one
line of logic → a script.

**Parallel is for disjoint work.** `parallel: true` starts a `run:` or agent
and the walk continues. Only emit it when steps do not share writes and do
not need the human (no interview, no gate, no approval). Put a `wait:` before
any later node that depends on that work; leftover in-flight work drains at
the end of the list. Sequential is the default.

**Tool scope is per node.** `allowed_tools:` on an `agent:` node or agent
step narrows what that step's subagent may reach for, in host-neutral
capability names (`read`, `search`, `edit`, `shell`, `web`, `spawn`) that the
lead maps to its host's tools. Reach for it where a step has no business
touching a capability — a reviewer that reads and writes its report needs no
`shell`, and no bundled agent delegates, so none needs `spawn`. Grant
everything the agent's own file tells it to do: an agent invoked with
`Commands:` needs `shell`, and every agent that writes a report under
`.awc/tasks/in-progress/<task>/` needs `edit`. Every scope keeps `web` —
looking up a library's docs or an error message is something any of them may
need.
Omitting the key grants the host's default, and that stays the norm — a scope
drawn too tight turns into a `blocked` halt mid-run.

**A script does exactly one thing.** A script with internal phases is a
workflow hiding inside a file — where the lead can't see progress, retry a
single step, or report where it failed. Splitting is the default; a node
script earns its place only when its steps are one atomic operation from the
workflow's point of view. The launch script (`./<name>.sh`) is not a node
script: it creates or reuses the worktree and starts the host, then the lead
takes over. `bun install` stays its own YAML node.

**The task trail has a place.** Every artifact the bundled agents write lands
under `.awc/tasks/in-progress/<task>/`, and only `spec.md` and
`acceptance-criteria.md` — the pair a human reads and approves — sit at its
root; every other artifact goes in `tmp/` beside them. A workflow that writes
that trail closes it with a node running
`workflows/<name>/scripts/finish-task.sh` — a `run:` path is written from the
launch directory, not from beside the YAML — which moves the whole directory
to `.awc/tasks/done/<task>/`. Agent files name their own paths, so everything
that touches the trail, `wait:` included, is a node before that one; only a
node that neither reads nor writes trail artifacts — a committer staging the
moved paths, a push — may follow. An agent you author
writes there too, so its workflow archives the same way.

**Commands print only on failure.** Every line of output lands in someone's
context. Recommend `bun test --only-failures`, quiet reporters, `--silent`
installs. A green run should cost near-zero tokens; failures should quote
themselves.

**Agents are instantiated from base templates.** The bundled agents are
bases for creating the real agents, never final artifacts: each copy in the
package is tailored to this workflow — it keeps only the modes the nodes
actually invoke and validates only artifacts the workflow actually produces.
A workflow without mutation testing ships a DoD validator that has never
heard of `mutation.md`. Tailoring stays inside the design rules: the YAML
owns orchestration and pairing, and every copy remains project-agnostic,
phase-unaware, isolated from other agents, and argument-driven (`Commands:`,
`Base:`, `Report:`, …). The templates inside the skill are never edited;
`workflow_lead.md` is the one agent copied unchanged.

**Gates are structural.** Human sign-offs are `gate:` nodes or interactive
loops; un-gameable checks are `until_run:` scripts reading a tool's own
output. Never a step where an agent (or the lead) passes itself.

**Artifacts state what is, not what was rejected.** The interview settles
some decisions by ruling alternatives out; the package still describes the
workflow in positive terms — "runs on the current branch", "plain acceptance
criteria", "split implementer/test-writer pairing" — never negation echoes
like "(no worktree)", "(non-gherkin)", "NOT TDD", or "ruled out". A reader
of the README, the YAML comments, or an agent prompt needs what the workflow
does; the road not taken lives only in the creation conversation.

## Package layout

```
<name>.sh                       # worktree launch — copy of assets/run.sh
agents-cli.conf                 # copy of assets/agents-cli.conf — do not edit
workflows/<name>/
├── <name>.yaml        # the workflow
├── README.md          # purpose, node walkthrough table, how to launch
├── running.md         # execution contract — verbatim copy of assets/running.md
├── agents/            # workflow_lead.md + every agent the nodes reference
└── scripts/           # one script = one thing; chmod +x
    └── finish-task.sh # copy of assets/finish-task.sh — archives the task trail
.claude/commands/<name>.md      # in-session launcher — Claude Code
.codex/skills/<name>/SKILL.md   # in-session launcher — Codex
.opencode/command/<name>.md     # in-session launcher — opencode
```

Everything under `workflows/<name>/` is host-neutral and written once. The
three launcher files are the same four instructions in each host's own
wrapper — `references/hosts.md` has the file templates, the argument
placeholder each host substitutes, and the hazards that shape them. Write all
three from that reference, generating the input mapping from this workflow's
actual `inputs:` list, and keep their wording aligned so a reader comparing
two of them sees one workflow. A worktree workflow also ships `./<name>.sh`
from that same reference: copy `assets/run.sh` and `assets/agents-cli.conf` to the
repo root as `./<name>.sh` and `./agents-cli.conf`, fill `__WORKTREE_PARENT__`,
`chmod +x` the script. Name and branch prefix are asked on a terminal at
launch (headless: script basename and `task`, or `AWC_NAME` /
`AWC_BRANCH_PREFIX`). An in-place workflow omits both.

The README's "how to launch" section names the path that applies: worktree →
`./<name>.sh <task> claude "<request>"` (or `codex` / `opencode`). On a
terminal the script asks for workflow name and branch prefix; headless uses
the script basename and `task`, or `AWC_NAME` / `AWC_BRANCH_PREFIX`. In-place →
the slash command for Claude Code and opencode, and the trigger phrase for
Codex. Commit the package on the current branch before the first worktree run.
Re-running the script resumes in the existing tree.

## The YAML at a glance

Full semantics live in `assets/running.md`; this is the flavor. A worktree
workflow's YAML starts at bootstrap — the launch script already put the host
in the tree:

```yaml
name: fix-bug
description: One bug report → a reviewed, committed fix

inputs:
  - name: task            # kebab id; names the task directory and the branch
  - name: request         # the bug report, in the reporter's own words

vars:
  commands: "bun run check"                # typecheck+lint+test, fails loudly, quiet when green
  test_command: "bun test --only-failures"
  base: main

nodes:
  - id: install
    run: bun install --silent

  - id: story
    loop:
      agent: agents/story_partner.md
      prompt: "Task: {{task}}. Mode: interview. Request: {{request}}. The human's previous answer: {{answer}}"
      expect: user_story
      until: USER_STORY_WRITTEN
      max_iterations: 20

  - id: build
    loop:
      steps:
        - agent: agents/implementer_tdd.md
          prompt: "Task: {{task}}. Mode: build-slice. Slice: {{iteration}}. Commands: {{commands}}."
          expect: green
        - agent: agents/reviewer_slice.md
          prompt: "Task: {{task}}. Mode: review-slice. Slice: {{iteration}}. Commands: {{test_command}}."
          expect: [APPROVED, CHANGES_REQUESTED]
        - agent: agents/implementer_tdd.md
          prompt: "Task: {{task}}. Mode: fix-slice-findings. Slice: {{iteration}}. Commands: {{commands}}."
          expect: green
      until: DONE
      max_iterations: 6

  - id: ship-gate
    gate: "Slices done. Review the diff on task/{{task}} — approve to finish."

  - id: finish
    run: workflows/fix-bug/scripts/finish-task.sh {{task}}
```

Independent checks overlap with `parallel: true`; `wait:` collects them
before anything that depends on the results:

```yaml
  - id: lint
    parallel: true
    run: bun run lint

  - id: typecheck
    parallel: true
    run: bun run typecheck

  - id: install
    run: bun install --silent

  - id: join-checks
    wait: [lint, typecheck]
```

A step that only reads the tree and writes its verdict says so:

```yaml
  - id: review
    agent: agents/reviewer_engineering.md
    prompt: "Task: {{task}}. Mode: full-review. Base: {{base}}."
    expect: [APPROVED, CHANGES_REQUESTED]
    allowed_tools: [read, search, edit, web]
```

These examples are illustrative, never templates to copy — every workflow's
nodes come from its own interview.

## Validation checklist (before handoff)

- The YAML parses, and every `agent:`/`run:` script path exists; scripts are
  executable.
- Every loop has `until:` **or** `until_run:`, and `max_iterations`.
- Every agent node/step has `expect:` and passes every argument its agent
  file requires — open each referenced agent file and check.
- Every packaged agent copy is scoped to this workflow: cross-check each one
  against the node list — no mode no node invokes, no check on an artifact no
  node produces, and a `description:` naming only the modes the copy kept.
- A workflow that specs anything writes `user-story.md` before it: the spec
  step opens by reading that file, so a `story_partner` node precedes it in
  whichever mode the interview chose — `interview`, `capture`, or
  `capture-and-confirm` — and a capture mode's node passes the `Source:` its
  agent file requires, naming a declared input or var. Match the node shape to
  the mode: the two interviewing modes are loops ending on
  `USER_STORY_WRITTEN` and pass `{{answer}}`; `capture` returns one line and no
  token, so it is a plain node judged by `expect:` — inside a loop it could
  never close one.
- Every agent that runs in a loop and has to build on earlier iterations —
  every interview above all — still carries its log protocol after the trim:
  each iteration is a fresh subagent, so that file is the only memory it has.
  Check the closing turn too — it fills the arriving answer in and appends no
  new entry, or the loop never reaches its token — and that the log is scoped
  to the mode that interviews. Its node passes `{{answer}}` and nothing more.
- Every `run:` is one short command with failure-only output where the tool
  allows it.
- Every `parallel: true` is on a top-level `run:` or `agent:` node — never a
  loop, gate, wait, or loop step. Every `wait:` names prior `parallel: true`
  ids. A `wait:` sits before any node that depends on that work.
- Every `allowed_tools:` is on an `agent:` node or agent step, and lists
  capability names (`read`, `search`, `edit`, `shell`, `web`, `spawn`) or a
  host tool name the workflow deliberately depends on. Read each scoped
  node's agent file and confirm the list covers everything that file tells
  the agent to do — a `Commands:` argument needs `shell`, a report file needs
  `edit`, and every scope keeps `web`.
- Every `{{placeholder}}` is a declared input, a var, or a loop-only one.
- The package contains `running.md`, `agents/workflow_lead.md`, and every
  referenced agent.
- A workflow whose agents write a task trail carries a `finish` node running
  `workflows/<name>/scripts/finish-task.sh {{task}}` — the path written from
  the launch directory, since that is where a `run:` executes — and that script
  is an executable verbatim copy of `assets/finish-task.sh`. It is the last
  node that touches the trail: every artifact-writing node, and any `wait:` on
  trail-writing parallel work, comes before it, and only a node that neither
  reads nor writes trail artifacts may follow. A workflow that commits its
  trail commits the archive move too, in a committer-agent node placed there.
- Every artifact path an agent copy names is an in-progress one:
  `.awc/tasks/in-progress/<task>/tmp/<file>.md`, except `spec.md` and
  `acceptance-criteria.md` at `.awc/tasks/in-progress/<task>/`. Only the lead's
  `complete ->` line names `.awc/tasks/done/<task>/`.
- All three in-session launchers exist — `.claude/commands/<name>.md`,
  `.codex/skills/<name>/SKILL.md`, `.opencode/command/<name>.md` — each
  pointing at the right paths and mapping its arguments onto every declared
  input. The two that substitute placeholders carry exactly one, inside its
  fenced slot and nowhere else in the file; the Codex skill's `description`
  names the phrases that should trigger it.
- A worktree workflow ships executable `./<name>.sh` and `./agents-cli.conf`
  copied from `assets/run.sh` and `assets/agents-cli.conf`, with
  `__WORKTREE_PARENT__` matching the interview. The script asks for
  workflow name and branch prefix on a terminal (headless defaults, or
  `AWC_NAME` / `AWC_BRANCH_PREFIX`). The YAML has no `git worktree`
  command and no `workdir:` key. An in-place workflow has neither file.
- The package reads positively: grep the generated README, YAML comments, and
  agent prompts for negation echoes (`no `, `not `, `ruled out`) and restate
  any decision-echo you find as what the workflow does. An agent's own hard
  rule ("never push") is a guardrail, not an echo — keep those.

Walk the node list end to end once more as the lead would run it: what
happens on each failure, where each halt lands, and whether any step edits
without a verification step after it.
