# Hosts

A workflow package is host-neutral everywhere it matters: the YAML, the agent
files, the scripts and `running.md` are plain text that any of the three
agents can read. Two things differ per host — **where a run is launched from**
and **what the lead calls to spawn a subagent** — so every package ships one
launcher per host and the reader picks the one their tool loads.

| Host | Launcher file | Arguments arrive as | Lead spawns a subagent with |
| --- | --- | --- | --- |
| Claude Code | `.claude/commands/<name>.md` | `\$ARGUMENTS` | the Task tool |
| Codex | `.codex/skills/<name>/SKILL.md` | the user's own message | `spawn_agent` |
| opencode | `.opencode/command/<name>.md` | `\$ARGUMENTS` | the `task` tool |

Write all three. They are small, they keep one package usable by a team on
mixed tools, and nothing else in the package changes.

## The launcher's job

Whatever the host, a launcher does the same four things, in this order:

1. Read `workflows/<name>/agents/workflow_lead.md` — that is the reader's role.
2. Read `workflows/<name>/running.md` — the execution contract.
3. Fill the workflow's declared `inputs:` from the arguments. A missing
   required input is `blocked` — ask for it instead of running.
4. Run the workflow top to bottom.

Generate step 3's mapping from the workflow's actual input list, in plain
words. Keep the four steps worded the same across the three files so a reader
comparing them sees one workflow, not three.

## Claude Code and opencode — the placeholder hazard

Both substitute `$`-placeholders *everywhere* in the launcher file before the
model reads it, and both accept the same `\$ARGUMENTS` spelling. Two
consequences:

- Instruction prose must never mention the placeholder outside its slot — a
  sentence explaining it gets rewritten into nonsense.
- Substitute it **exactly once**, into a fenced slot, because id-like inputs
  feed paths and branch names and a stray word poisons them.

(The placeholder is backslash-escaped throughout this file so your own
invocation leaves it intact. The launcher files you write must carry the
literal placeholder with no backslash.)

Claude Code's frontmatter takes `description` and `argument-hint`; opencode's
takes `description` and optionally `agent`. Otherwise the two files are the
same text:

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

## Codex — a skill, not a slash command

Codex loads project-level skills from `.codex/skills/`, and that is the slot a
package can ship into. A skill is selected by its `description` and reads its
arguments from what the user actually typed, so the codex launcher names its
trigger phrases and takes the inputs from the conversation:

```markdown
---
name: <name>
description: Run the <name> workflow — <one line on what it produces>. Use when the user asks to run <name>, start the <name> workflow, or hands over a task id and a request for it.
---

You are the workflow lead for this run — coordination only.

1. Read workflows/<name>/agents/workflow_lead.md — that is your role; follow it exactly.
2. Read workflows/<name>/running.md — the execution contract for the workflow file.
3. Fill the workflow's inputs from the user's message: the kebab id they name
   is `task`; the rest of their request is `request`. A missing required
   input is `blocked` — ask for it instead of running.
4. Run the workflow, top to bottom: Task: <task>. Mode: run. Workflow: workflows/<name>/<name>.yaml.
```

Give the `description` real trigger phrases — it is the only thing that gets
this skill selected, and a vague one leaves the workflow unreachable.
