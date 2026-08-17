# CLAUDE.md

This file provides guidance to LLMs when working with code in this repository.

## What this repo is

`awc` (agentic-workflow-creator) is a Node CLI that launches LLMs
pre-loaded with a bundled plugin (skills + commands) for a single session,
without touching the user's `~/.claude` or the target project's `.claude/`.
It stages `templates/claude/` into a temp folder, spawns
`claude --plugin-dir <tmp>/plugin <prompt>`, and deletes the temp folder on
exit. See `SPEC.md` for the full design rationale.

The bundled plugin's centerpiece is the **workflow-creator** skill: it
interviews a user and generates a "lead-run agentic workflow package" — a
YAML of tiny nodes executed step by step by a `workflow_lead` subagent, plus
the agent files and scripts those nodes invoke.

There are two largely independent things to reason about:

1. **The `awc` CLI itself** — `src/`, plain Node/TypeScript.
2. **The bundled workflow-creator plugin content** — `templates/claude/`,
   which is prose/Markdown/YAML consumed by a *different* Claude Code
   session (the one `awc` launches), not by this repo's build.

## Commands

```bash
bun install         # install deps
bun run build        # bundle src/cli.ts -> dist/cli.js (bun build --target=node)
bun run typecheck     # tsc --noEmit
bun test              # run all unit tests (test/*.test.ts)
bun test test/staging.test.ts   # run a single test file
bun run smoke         # node dist/cli.js claude -- --version (full stage/spawn/cleanup cycle against the real `claude` binary)
bun run check          # biome check
bun run format         # biome format --write
bun run lint           # biome lint
```

Bun is the dev toolchain only; the published output (`dist/cli.js`) must stay
100% Node-compatible (no `Bun.*` globals in `src/`). Formatting: single
quotes, no semicolons (ASI), 2-space indent (biome.json).

## Architecture — the CLI (`src/`)

Small, linear pipeline, one file per concern:

- `cli.ts` — entry point: parses argv, handles `--help`/`--version`, dispatches
  to an agent (currently only `claude`).
- `args.ts` — `parseCli`: splits argv on the first `--` into "own" flags vs.
  `passthrough` args forwarded verbatim to the `claude` binary.
- `agents/claude.ts` — `runClaude`: the stage → spawn → cleanup lifecycle.
  Registers `SIGINT` as a no-op (Claude Code owns Ctrl+C internally — the
  wrapper must survive it and only clean up when the child actually exits),
  `SIGTERM` → exit 143, and a synchronous `process.on('exit')` cleanup as the
  last-chance guard against a hard kill.
- `staging.ts` — `stage`/`cleanup`/`readPrompt`: copies
  `templates/claude/plugin/` into `<tmpDir>/plugin`, always deleting any
  stale `tmpDir` first (self-heals after a `kill -9`, which cannot be
  intercepted by handlers).
- `paths.ts` — resolves `templatesDir()`/`packageJsonPath()` relative to the
  compiled entry file via `new URL(..., import.meta.url)`, **never**
  `process.cwd()` — this is what makes it work identically via `npx`, a
  global install, and `node dist/cli.js` run locally.

Only `agents/claude.ts` is Claude-Code-specific; adding another agent means a
new file under `src/agents/` plus a new `case` in `cli.ts`'s dispatch.

## Architecture — the bundled plugin (`templates/claude/`)

```
templates/claude/
├── prompt.md                        # initial message injected into the launched session
└── plugin/
    ├── .claude-plugin/plugin.json
    ├── commands/awc-status.md       # /awc-status
    └── skills/workflow-creator/
        ├── SKILL.md                 # the skill's process (recon → interview → design → write → validate)
        ├── references/
        │   ├── interview.md         # what to ask, one question per turn
        │   └── agent-catalog.md     # bundled base agents: args, return signals, pairing/loop rules
        └── assets/
            ├── running.md           # the YAML dialect's execution contract — copied verbatim into every generated package
            └── agents/*.md          # base agent templates instantiated (tailored) per generated workflow
```

Key things to know before touching this content:

- The bundled agents in `assets/agents/` are **base templates, never final
  artifacts**. The skill copies and tailors one per workflow into the
  generated package's `agents/`, trimming modes/checks the workflow doesn't
  use — except `workflow_lead.md`, which every package copies unchanged.
- `test/staging.test.ts` cross-checks `references/agent-catalog.md`'s agent
  table against `assets/agents/*.md` in both directions — adding or removing
  a bundled agent template requires updating the catalog table row, or the
  test fails.
- The generated YAML dialect (nodes: `run:`, `agent:`+`prompt:`, `loop:`,
  `gate:`, `when:`) is fully specified in `assets/running.md` — read it
  before changing anything that touches how workflows are authored or
  executed.
- Generated launch commands (`.claude/commands/<name>.md`) substitute
  `$ARGUMENTS` exactly once into a fenced block; prose in that file must
  never mention the literal placeholder elsewhere, since the harness
  rewrites every occurrence before the model sees it.
- Generated packages must read positively — no "(no worktree)", "NOT TDD",
  or similar negation echoes of ruled-out alternatives; SKILL.md's
  validation checklist greps for this before handoff.

## Eval material (`workflow-creator-workspace/`)

Not part of the shipped package (not in `package.json`'s `files`). Holds:
- `fixtures/` — tiny target repos (tracked as plain files) that eval prompts
  point the workflow-creator skill at.
- `evals/evals.json` — eval prompts + expectations for grading generated
  workflow packages.
- `scripts/check_package.ts` — run via
  `bun workflow-creator-workspace/scripts/check_package.ts <repo-dir> <skill-running-md-path>`;
  extracts objective JSON facts about a generated package (node shapes, ref
  resolution, grep flags) — it never judges pass/fail itself, graders combine
  these facts with their own reading.

`workflows-examples/` holds example generated workflow output, for reference.

## Commit conventions

This repo uses Conventional Commits with no AI co-author attribution (see
`.agents/commands/commit.md`). Group commits by concern in dependency order:
CLI source+tests, then plugin/skill content, then eval material, then
tooling/config/docs. Keep a source change and its test in the same commit.
