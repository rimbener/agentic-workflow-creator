# AGENTS.md

This file provides guidance to LLMs when working with code in this repository.

## What this repo is

`awc` (agentic-workflow-creator) is a Node CLI that launches a coding agent —
Claude Code, Codex, or opencode — pre-loaded with a bundled skill and command
for a single session, without touching the user's global agent config or the
target project's config directory. It stages `templates/` into a temp folder,
spawns the agent pointed at it, and deletes the folder on exit. See `SPEC.md`
for the full design rationale.

The bundled payload's centerpiece is the **workflow-creator** skill: it
interviews a user and generates a "lead-run agentic workflow package" — a
YAML of tiny nodes executed step by step by a `workflow_lead` subagent, plus
the agent files and scripts those nodes invoke.

There are two largely independent things to reason about:

1. **The `awc` CLI itself** — `src/`, plain Node/TypeScript.
2. **The bundled workflow-creator content** — `templates/`, which is
   prose/Markdown/YAML consumed by a *different* agent session (the one `awc`
   launches), not by this repo's build.

## Commands

```bash
bun install         # install deps
bun run build        # bundle src/cli.ts -> dist/cli.js (bun build --target=node)
bun run typecheck     # tsc --noEmit
bun test              # run all unit tests (test/*.test.ts)
bun test test/staging.test.ts   # run a single test file
bun run smoke         # scripts/smoke.sh — per installed agent: stage/spawn/cleanup cycle against the real binary, plus a check that the payload landed under that host's dir names
bun run check          # biome check
bun run format         # biome format --write
bun run lint           # biome lint
```

Bun is the dev toolchain only; the published output (`dist/cli.js`) must stay
100% Node-compatible (no `Bun.*` globals in `src/`). Formatting: single
quotes, no semicolons (ASI), 2-space indent (biome.json).

## Architecture — the CLI (`src/`)

Small, linear pipeline, one file per concern:

- `cli.ts` — entry point: parses argv, handles `--help`/`--version`, loads
  the host roster from `assets/agents-cli.conf`, dispatches through `RUNNERS`.
- `hosts.ts` — parses that roster (names, TUI argv, help, smoke paths).
- `args.ts` — `parseCli`: splits argv on the first `--` into "own" flags vs.
  `passthrough` args forwarded verbatim to the agent binary.
- `agents/run.ts` — `launch`: the spawn → signal → cleanup lifecycle every
  agent shares. Registers `SIGINT` as a no-op (the agent TUIs own Ctrl+C
  internally — the wrapper must survive it and only clean up when the child
  actually exits), `SIGTERM` → exit 143, and a synchronous
  `process.on('exit')` cleanup as the last-chance guard against a hard kill.
- `agents/{claude,codex,opencode}.ts` — one file per host: a `stage*` function
  (exported, so tests can drive it without spawning) and a `run*` that stages
  then calls `launch`.
- `staging.ts` — `resetTmp`/`copyPayload`/`shadow`/`cleanup`/`readPrompt`.
  `resetTmp` always deletes a stale `tmpDir` first (self-heals after a
  `kill -9`, which cannot be intercepted by handlers). `shadow` is the piece
  that makes the env-var hosts work — read its comment before touching it.
- `paths.ts` — resolves `templatesDir()`/`sharedDir()`/`hostDir()`/
  `agentsCliConfPath()`/`packageJsonPath()` relative to the compiled entry file via
  `new URL(..., import.meta.url)`, **never** `process.cwd()` — this is what
  makes it work identically via `npx`, a global install, and
  `node dist/cli.js` run locally.

Adding another agent means a row in `assets/agents-cli.conf`, a file under
`src/agents/`, and `templates/hosts/<name>/prompt.md`.

Codex is the odd one out for the payload's *command* half: it has no
slash-command slot (it dropped `$CODEX_HOME/prompts` in 0.117.0), so
`awc-status` ships there as a second skill via `copyCommandsAsSkills`. Do not
"restore" a `prompts/` dir — it is never read, and a file sitting in it passes
every on-disk check while doing nothing. `scripts/smoke.sh` guards this by
asserting each host actually *loads* the payload (`codex debug prompt-input`,
`opencode debug skill` + `debug config`), run from a scratch dir so this
repo's own AGENTS.md cannot satisfy the grep.

The three hosts are injected differently, and that asymmetry is the main thing
to keep straight (full table in `SPEC.md`): Claude Code takes a whole plugin
from `--plugin-dir`, while Codex (`CODEX_HOME`) and opencode
(`OPENCODE_CONFIG_DIR`) read one config directory that the env var *replaces*
rather than extends. Hence `shadow`: symlink every entry of the user's real
config dir into the temp dir, but make the skill/command dirs real folders
holding links to the user's entries plus our payload. Staging never writes
into the real config dir; the agent writing through a link (a refreshed token,
a new session file) lands where it should.

## Architecture — the bundled content (`templates/`)

```
templates/
├── shared/                          # host-neutral; staged into every host under its own dir names
│   ├── commands/awc-status.md       # /awc-status
│   └── skills/workflow-creator/
│       ├── SKILL.md                 # the skill's process (recon → interview → design → write → validate)
│       ├── references/
│       │   ├── interview.md         # what to ask, one question per turn
│       │   ├── agent-catalog.md     # bundled base agents: args, return signals, pairing/loop rules
│       │   └── hosts.md             # in-session launchers + worktree launch script
│       └── assets/
│           ├── running.md           # the YAML dialect's execution contract — copied verbatim into every generated package
│           ├── run.sh               # worktree launch template — copied to ./<name>.sh; FILL is worktree parent
│           ├── agents-cli.conf      # host roster — add/remove a host only here
│           └── agents/*.md          # base agent templates instantiated (tailored) per generated workflow
└── hosts/
    ├── claude/{prompt.md, plugin/.claude-plugin/plugin.json}
    ├── codex/prompt.md
    └── opencode/prompt.md
```

Key things to know before touching this content:

- The bundled agents in `assets/agents/` are **base templates, never final
  artifacts**. The skill copies and tailors one per workflow into the
  generated package's `agents/`, trimming modes/checks the workflow doesn't
  use — except `workflow_lead.md`, which every package copies unchanged.
- `test/staging.test.ts` cross-checks `references/agent-catalog.md`'s agent
  table against `assets/agents/*.md` in both directions — adding or removing
  a bundled agent template requires updating the catalog table row, or the
  test fails. It also drives each host's `stage*` function directly, so a new
  host needs a case there.
- The generated YAML dialect (nodes: `run:`, `agent:`+`prompt:`, `loop:`,
  `gate:`, `when:`) is fully specified in `assets/running.md` — read it
  before changing anything that touches how workflows are authored or
  executed.
- Every generated package ships **three** in-session launchers — `.claude/commands/`,
  `.codex/skills/`, `.opencode/command/` — specified in `references/hosts.md`.
  A worktree workflow also ships `./<name>.sh` from `assets/run.sh` and
  `./agents-cli.conf` from `assets/agents-cli.conf` (add/remove a host only there):
  the script creates (or reuses) the worktree and starts the host already
  inside it, so the YAML has no worktree node. The Claude Code and opencode ones substitute `$ARGUMENTS` 
  exactly once into a fenced block; prose in those files must never mention the 
  literal placeholder elsewhere, since the harness rewrites every occurrence before
  the model sees it (which is why `hosts.md` backslash-escapes it throughout).
  Codex has no project-level slash commands, so its launcher is a project
  skill triggered by its `description` instead.
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
