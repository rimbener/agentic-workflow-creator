# awc — agentic-workflow-creator

## Summary

`awc` is a small CLI that launches an AI coding agent (initially Claude Code) pre-loaded
with a curated set of skills, slash commands, and scripts — without touching the user's
global agent configuration or the project's `.claude/` directory.

It works by copying bundled workflow assets into a temporary folder, launching the agent
with that folder mounted as a session-only plugin, and deleting the folder when the agent
exits.

```
npx agentic-workflow-creator claude
# or, when installed globally:
awc claude
```

## Goals

- One command to start a fully-equipped agent session: no manual setup, no config edits.
- Zero footprint: nothing persists in the project or in `~/.claude` after the session ends.
- 100% Node.js compatible output; Bun is used only as the dev toolchain.
- Extensible to other agents later (`awc <agent>` is a subcommand, `claude` is the first).

## Non-goals (v0.1)

- No interactive workflow picker or multiple workflow templates (one bundled template).
- No support for agents other than Claude Code.
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

Options:
  --keep          Do not delete .awc-tmp/ on exit (debugging)
  --tmp-dir <p>   Temp folder location (default: ./.awc-tmp)
  -h, --help      Show help
  -v, --version   Show version

Everything after `--` is passed through to the agent CLI verbatim.
```

Exit code: `awc` exits with the agent process's exit code (`143` on SIGTERM).

## Runtime behavior (the `claude` agent)

1. **Preflight**
   - Verify the `claude` binary is on `PATH`; if missing, print install instructions and exit 1.
   - If a stale `.awc-tmp/` exists (leftover from a hard kill), delete it.
2. **Stage temp workspace**
   - Create `.awc-tmp/` in the current working directory.
   - Copy `templates/claude/plugin/` (shipped inside the npm package) to `.awc-tmp/plugin/`.
   - Read the initial prompt from `templates/claude/prompt.md`.
3. **Launch**
   - Spawn: `claude --plugin-dir .awc-tmp/plugin "<initial prompt>" [passthrough args]`
   - `stdio: "inherit"` so the interactive TUI owns the terminal.
   - The plugin is session-only: Claude Code loads skills/commands from `--plugin-dir`
     without writing anything to `~/.claude` or the project.
4. **Cleanup**
   - On child exit: delete `.awc-tmp/` (unless `--keep`), exit with the child's code.
   - `SIGINT` (Ctrl+C) is a **no-op in the wrapper** — Claude Code uses Ctrl+C internally
     (interrupt turn, exit), so the wrapper must survive it and clean up only after the
     child actually exits.
   - `SIGTERM`: clean up and exit 143.
   - `process.on("exit")`: last-chance synchronous `rmSync` (idempotent).
   - `kill -9` cannot be intercepted; the stale-folder deletion in step 1 covers that case.

## Bundled workflow template (v0.1)

```
templates/claude/
├── prompt.md                        # initial user message for the session
└── plugin/
    ├── .claude-plugin/
    │   └── plugin.json              # { name, description, version }
    ├── skills/
    │   └── workflow-creator/
    │       └── SKILL.md             # guides the agent through designing a workflow
    ├── commands/
    │   └── awc-status.md            # /awc-status — summarize workflow progress
    └── scripts/
        └── scaffold.sh              # helper the skill can invoke
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
│   │   └── claude.ts   # stage → spawn → cleanup lifecycle for Claude Code
│   ├── staging.ts      # temp folder create/copy/remove
│   └── paths.ts        # resolve packaged templates/ relative to dist/cli.js
├── templates/claude/…  # (above)
└── test/               # bun test — staging + arg parsing units
```

## Implementation constraints

- **Node-only APIs**: `node:fs`, `node:path`, `node:child_process`, `node:process`,
  `node:url`. No `Bun.*` globals anywhere in `src/`.
- **Zero runtime dependencies** — arg parsing is done with `node:util` `parseArgs`.
- **Build**: `bun build src/cli.ts --target=node --outdir dist` (bundled, minifiable).
- **Test**: `bun test` for units; smoke test = `node dist/cli.js claude -- --version`
  (launches and exits immediately, exercising the full stage/spawn/cleanup cycle).
- `templates/` is resolved relative to the compiled entry file
  (`new URL("../templates", import.meta.url)`), never relative to `process.cwd()`,
  so it works via `npx`, global install, and local `node dist/cli.js` alike.

## Risks / open questions

- `--plugin-dir` is the documented session-only plugin mechanism (verified against
  Claude Code 2.1.232); if its behavior changes, `agents/claude.ts` is the only file
  affected.
- A leftover `.awc-tmp/` after `kill -9` is acceptable (self-heals on next run);
  users should add `.awc-tmp/` to `.gitignore` — the README will note this.

## Milestones

1. **v0.1.0** — everything above: `awc claude`, one bundled template, cleanup lifecycle.
2. v0.2.0 — multiple templates (`awc claude --template <name>`), `awc list`.
3. v0.3.0 — additional agents.
