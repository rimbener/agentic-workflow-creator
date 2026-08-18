# awc — agentic-workflow-creator

## Summary

`awc` is a small CLI that launches an AI coding agent (Claude Code, Codex, or opencode)
pre-loaded with a curated set of skills, slash commands, and scripts — without touching
the user's global agent configuration or the project's own config directory.

It works by copying bundled workflow assets into a temporary folder, launching the agent
pointed at that folder for one session only, and deleting the folder when the agent
exits.

```
npx agentic-workflow-creator claude
# or, when installed globally:
awc claude
awc codex
awc opencode
```

## Goals

- One command to start a fully-equipped agent session: no manual setup, no config edits.
- Zero footprint: nothing persists in the project or in the agent's config dir after the
  session ends — while the user's own credentials, models, MCP servers and history keep
  working and keep persisting where they normally do.
- 100% Node.js compatible output; Bun is used only as the dev toolchain.
- Generated workflow packages are host-neutral, and ship a launcher for each supported
  agent — a workflow created under one tool runs under the others.

## Non-goals

- No interactive workflow picker or multiple workflow templates (one bundled template).
- No self-update / template fetching from the network.

## Distribution

| Item | Value |
| --- | --- |
| npm package name | `agentic-workflow-creator` (the name `awc` is taken on npm) |
| bin | `"awc": "dist/cli.js"` |
| invocation | `npx agentic-workflow-creator claude` or `awc claude` |
| engines | `node >= 18` |
| module format | ESM, single bundled file with `#!/usr/bin/env node` shebang |

The published package ships `dist/` (bundled JS) and `templates/` (workflow assets).

## CLI interface

```
awc <agent> [options] [-- <agent args...>]

Agents:
  claude          Launch Claude Code with the bundled workflow plugin
  codex           Launch Codex with the bundled workflow skill
  opencode        Launch opencode with the bundled workflow skill

Options:
  --keep          Do not delete .awc-tmp/ on exit (debugging)
  --tmp-dir <p>   Temp folder location (default: ./.awc-tmp)
  -h, --help      Show help
  -v, --version   Show version

Everything after `--` is passed through to the agent CLI verbatim.
```

Exit code: `awc` exits with the agent process's exit code (`143` on SIGTERM).

## Runtime behavior

1. **Preflight**
   - The agent binary is verified by spawning it; `ENOENT` prints install instructions
     and exits 1.
   - If a stale `.awc-tmp/` exists (leftover from a hard kill), delete it.
2. **Stage temp workspace**
   - Create `.awc-tmp/` in the current working directory.
   - Place the shared payload (`templates/shared/skills/`, `templates/shared/commands/`)
     under the names the target agent looks for — see the host table below.
   - Read the initial prompt from `templates/hosts/<agent>/prompt.md`.
3. **Launch**
   - Spawn the agent with `stdio: "inherit"` so the interactive TUI owns the terminal,
     plus any passthrough args.
4. **Cleanup**
   - On child exit: delete `.awc-tmp/` (unless `--keep`), exit with the child's code.
   - `SIGINT` (Ctrl+C) is a **no-op in the wrapper** — the agent TUIs use Ctrl+C
     internally (interrupt turn, exit), so the wrapper must survive it and clean up only
     after the child actually exits.
   - `SIGTERM`: clean up and exit 143.
   - `process.on("exit")`: last-chance synchronous `rmSync` (idempotent).
   - `kill -9` cannot be intercepted; the stale-folder deletion in step 1 covers that case.

## How each host is loaded

| Agent | Staged as | Injected by | Skill / command dir names |
| --- | --- | --- | --- |
| `claude` | `.awc-tmp/plugin/` | `--plugin-dir` | `skills/`, `commands/` |
| `codex` | `.awc-tmp/codex-home/` | `CODEX_HOME` env | `skills/` only (see below) |
| `opencode` | `.awc-tmp/opencode-config/` | `OPENCODE_CONFIG_DIR` env | `skill/`, `command/` |

Claude Code takes a whole plugin from one flag, so its staging is a plain copy.

Codex has **no slash-command slot at all**: it dropped `$CODEX_HOME/prompts` in 0.117.0
in favour of skills, and offers no project-level equivalent. So the bundled `awc-status`
command ships there as a second skill (`skills/awc-status/SKILL.md`) rather than a flat
markdown file — Codex takes a skill's name from its directory, so the shared file's own
frontmatter carries over unchanged. This is also why `scripts/smoke.sh` asserts the host
*loads* the payload and not merely that the file exists: a file in a slot the agent
stopped reading passes every on-disk check while doing nothing.

Codex and opencode have no session-only plugin flag — each reads everything from a single
config directory, and pointing the env var elsewhere *replaces* that directory rather than
adding to it. So `awc` stages a **shadow**: every entry of the real config dir symlinked
into the temp dir, except the skill/command dir names, which become real directories
holding symlinks to the user's own entries plus the bundled payload.

Consequences, and why this is the chosen design:

- The user's credentials, model config, MCP servers, agents and plugins all still load.
- Writes through a link (a refreshed token, a new session file) land in the user's real
  config dir, so `codex resume` and opencode session history keep working.
- Staging never writes into the real config dir; deleting `.awc-tmp/` removes only links.
  This needs care on name collisions: if the user already has their own
  `workflow-creator` skill or `awc-status` command, the shadow's link for that name is
  the copy destination, and `cpSync` follows a symlinked destination. `copyPayload`
  therefore unlinks each target name before copying, so the session gets a real file in
  the temp dir and the user's original is left alone.

## Bundled workflow template

```
templates/
├── shared/                          # host-neutral payload, staged into every host
│   ├── skills/workflow-creator/
│   │   ├── SKILL.md                 # interview → design → generate a lead-run workflow package
│   │   ├── references/              # interview checklist, agent catalog, host launcher table
│   │   └── assets/
│   │       ├── running.md           # execution contract, copied into every generated package
│   │       └── agents/              # base agent templates the skill instantiates per workflow
│   └── commands/
│       └── awc-status.md            # /awc-status — summarize workflow progress
└── hosts/
    ├── claude/
    │   ├── prompt.md                # initial user message for the session
    │   └── plugin/.claude-plugin/plugin.json
    ├── codex/prompt.md
    └── opencode/prompt.md
```

The template content is a starting point; iterating on it does not require code changes.

## Project structure

```
├── SPEC.md
├── package.json
├── tsconfig.json
├── src/
│   ├── cli.ts          # arg parsing, help/version, agent dispatch
│   ├── agents/
│   │   ├── run.ts      # shared spawn → signal → cleanup lifecycle
│   │   ├── claude.ts   # stage via --plugin-dir
│   │   ├── codex.ts    # stage via CODEX_HOME shadow
│   │   └── opencode.ts # stage via OPENCODE_CONFIG_DIR shadow
│   ├── staging.ts      # temp folder reset/copy/shadow/remove
│   └── paths.ts        # resolve packaged templates/ relative to dist/cli.js
├── templates/…         # (above)
└── test/               # bun test — staging + arg parsing units
```

## Implementation constraints

- **Node-only APIs**: `node:fs`, `node:path`, `node:child_process`, `node:os`,
  `node:process`, `node:url`. No `Bun.*` globals anywhere in `src/`.
- **Zero runtime dependencies** — arg parsing is done with `node:util` `parseArgs`.
- **Build**: `bun build src/cli.ts --target=node --outdir dist` (bundled, minifiable).
- **Test**: `bun test` for units; `scripts/smoke.sh` for each installed agent — one
  `--version` run exercising the full stage/spawn/cleanup cycle (which also pins the
  assumption that each CLI short-circuits on `--version` with the initial prompt already
  in argv), and a second under `--keep` asserting the payload landed as real files under
  that host's directory names.
- `templates/` is resolved relative to the compiled entry file
  (`new URL("../templates", import.meta.url)`), never relative to `process.cwd()`,
  so it works via `npx`, global install, and local `node dist/cli.js` alike.

## Generated packages

A generated workflow package is host-neutral where it matters — the YAML, the agent
prompts, the scripts and `running.md` are plain text the lead reads and passes on, so the
agent files need no registration with any host. Two things differ per host, and the
package ships all three variants:

| Host | Launcher file | Arguments | Lead spawns a subagent with |
| --- | --- | --- | --- |
| Claude Code | `.claude/commands/<name>.md` | `$ARGUMENTS` | the Task tool |
| Codex | `.codex/skills/<name>/SKILL.md` | the user's message | `spawn_agent` |
| opencode | `.opencode/command/<name>.md` | `$ARGUMENTS` | the `task` tool |

Codex has no project-level slash commands, so its launcher is a project skill selected by
its `description` rather than a command taking a placeholder. The skill's
`references/hosts.md` is the authority on these files. A worktree workflow also
ships `./<name>.sh` (from `assets/run.sh`) so the host starts inside the tree.

## Risks / open questions

- Each host's injection mechanism is verified against a real binary — Claude Code 2.1.233
  (`--plugin-dir`), Codex 0.147.0 (`CODEX_HOME`), opencode 1.18.18 (`OPENCODE_CONFIG_DIR`).
  If one changes, only that host's file under `src/agents/` is affected.
- The shadow approach assumes the config dir is a flat set of entries the host reads by
  name. A host that starts writing a lockfile or index *into* the config dir root would
  write through the symlink to the real one — acceptable (that is where it belongs), but
  worth re-checking on a major version bump.
- A leftover `.awc-tmp/` after `kill -9` is acceptable (self-heals on next run);
  users should add `.awc-tmp/` to `.gitignore` — the README notes this.

## Milestones

1. **v0.1.0** — `awc claude`, one bundled template, cleanup lifecycle.
2. **v0.2.0** — `awc codex` and `awc opencode`; generated packages ship a launcher per host.
3. v0.3.0 — multiple templates (`awc <agent> --template <name>`), `awc list`.
