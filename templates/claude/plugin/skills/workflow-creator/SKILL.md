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
   both per the catalog's rules), the scripts, `running.md` copied verbatim
   from `assets/running.md`, a short README, and the launch command.
5. **Validate** (checklist below), then hand off: how to launch, what the run
   will ask of them, and where the artifacts land.

## The rules that make a workflow good

**Nodes stay tiny.** A node is one short prompt, one agent call, or one
command — never several lines of inline shell. More than one line of logic →
a script.

**A script does exactly one thing.** A script with internal phases is a
workflow hiding inside a file — where the lead can't see progress, retry a
single step, or report where it failed. `bun install` and `git worktree add`
are two nodes, never one `bootstrap.sh`. Splitting is the default; a script
earns its place only when its steps are one atomic operation from the
workflow's point of view.

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
workflows/<name>/
├── <name>.yaml        # the workflow
├── README.md          # purpose, node walkthrough table, how to launch
├── running.md         # execution contract — verbatim copy of assets/running.md
├── agents/            # workflow_lead.md + every agent the nodes reference
└── scripts/           # one script = one thing; chmod +x
.claude/commands/<name>.md   # the launch command
```

The launch command file maps its arguments onto the workflow's declared
`inputs:`. Two hazards shape its layout: the harness substitutes `$`-
placeholders *everywhere* in the file before the model reads it, so
instruction prose must never mention one — a sentence explaining a
placeholder gets rewritten into nonsense; and id-like inputs feed paths and
branch names, so a stray word poisons them. Therefore: substitute
`\$ARGUMENTS` exactly once, into a fenced slot, and spell the input mapping
in plain words the lead applies to that slot. Generate the mapping from the
workflow's actual input list. (The placeholder is backslash-escaped
throughout this file so your own invocation leaves it intact — the launcher
file you write must carry the literal placeholder with no backslash.) For
the common `task` + `request` pair:

```markdown
---
description: Run the <name> workflow
argument-hint: <task-id> <the request, in your own words>
---

You are the workflow lead for this run — coordination only.

The launch arguments, verbatim:
<args>
\$ARGUMENTS
</args>

1. Read workflows/<name>/agents/workflow_lead.md — that is your role; follow it exactly.
2. Read workflows/<name>/running.md — the execution contract for the workflow file.
3. Fill the workflow's inputs from the args block: the first word is `task`
   (the kebab id); everything after it is `request`. A missing required
   input is `blocked` — ask for it instead of running.
4. Run the workflow, top to bottom: Task: <task>. Mode: run. Workflow: workflows/<name>/<name>.yaml.
```

## The YAML at a glance

Full semantics live in `assets/running.md`; this is the flavor:

```yaml
name: fix-bug
description: One bug report → a reviewed, committed fix

inputs:
  - name: task            # kebab id; names .awc/tasks/<task>/ and the branch
  - name: request         # the bug report, in the reporter's own words

vars:
  commands: "bun run check"                # typecheck+lint+test, fails loudly, quiet when green
  test_command: "bun test --only-failures"
  base: main

workdir: .worktrees/{{task}}

nodes:
  - id: worktree
    dir: .                                 # runs before workdir exists
    run: git worktree add .worktrees/{{task}} -b task/{{task}} {{base}}

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
```

This example is illustrative, never a template to copy — every workflow's
nodes come from its own interview.

## Validation checklist (before handoff)

- The YAML parses, and every `agent:`/`run:` script path exists; scripts are
  executable.
- Every loop has `until:` **or** `until_run:`, and `max_iterations`.
- Every agent node/step has `expect:` and passes every argument its agent
  file requires — open each referenced agent file and check.
- Every packaged agent copy is scoped to this workflow: cross-check each one
  against the node list — no mode no node invokes, no check on an artifact no
  node produces.
- Every `run:` is one short command with failure-only output where the tool
  allows it.
- Every `{{placeholder}}` is a declared input, a var, or a loop-only one.
- The package contains `running.md`, `agents/workflow_lead.md`, and every
  referenced agent; the launch command points at the right paths and maps its
  arguments onto every declared input.
- The package reads positively: grep the generated README, YAML comments, and
  agent prompts for negation echoes (`no `, `not `, `ruled out`) and restate
  any decision-echo you find as what the workflow does. An agent's own hard
  rule ("never push") is a guardrail, not an echo — keep those.

Walk the node list end to end once more as the lead would run it: what
happens on each failure, where each halt lands, and whether any step edits
without a verification step after it.
