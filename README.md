# awc — agentic-workflow-creator

Launch Claude Code, Codex, or opencode pre-loaded with a curated set of skills,
slash commands, and scripts — without touching your global agent configuration
or your project's own config directory.

```bash
npx agentic-workflow-creator claude
```

Or install globally to get the short command:

```bash
npm install -g agentic-workflow-creator
awc claude
```

## How it works

1. Copies the bundled workflow assets into a temporary `.awc-tmp/` folder.
2. Launches the agent pointed at that folder, with an initial prompt, so the
   skills and commands are loaded **for this session only**.
3. Deletes `.awc-tmp/` when the session ends.

How step 2 works depends on the agent:

| Agent | Mechanism |
| --- | --- |
| `claude` | `claude --plugin-dir .awc-tmp/plugin` |
| `codex` | `CODEX_HOME` pointed at a shadow of `~/.codex` |
| `opencode` | `OPENCODE_CONFIG_DIR` pointed at a shadow of `~/.config/opencode` |

Codex and opencode have no session-only plugin flag — they load everything from
one config directory. So `awc` builds a *shadow* of yours: every entry symlinked
back to the real one, except the skill and command folders, which are real
directories holding links to your own entries plus the bundled payload. Your
credentials, models, MCP servers, sessions and history all still work and still
persist to their real locations; only the links are thrown away at exit.

Add `.awc-tmp/` to your `.gitignore`. It normally never survives a session, but
a hard kill (`kill -9`, terminal crash) can leave it behind — the next run
cleans it up automatically.

## Usage

```
awc <agent> [options] [-- <agent args...>]

Agents:
  claude          Launch Claude Code with the bundled workflow plugin
  codex           Launch Codex with the bundled workflow skill
  opencode        Launch opencode with the bundled workflow skill

Options:
  --keep          Do not delete the temp folder on exit (debugging)
  --tmp-dir <p>   Temp folder location (default: ./.awc-tmp)
  -h, --help      Show help
  -v, --version   Show version
```

Everything after `--` is passed through to the agent's CLI verbatim, e.g.:

```bash
awc claude -- --model opus
```

## What it generates

The bundled **workflow-creator** skill interviews you and writes a workflow
package. The package itself is host-neutral — the YAML, the agent prompts, the
scripts and the execution contract are plain text any of the three agents can
read — and it ships one in-session launcher per host, so a workflow created in
one tool runs in the others. A worktree workflow also ships `./<name>.sh`, which
creates the tree and starts the host already inside it:

```
<name>.sh                         # worktree workflows: create tree, start host
agents-cli.conf                   # host roster the script reads
workflows/<name>/                 # the workflow, its agents and scripts
.claude/commands/<name>.md        # in-session launcher — Claude Code
.codex/skills/<name>/SKILL.md     # in-session launcher — Codex
.opencode/command/<name>.md       # in-session launcher — opencode
```

## Use locally (without publishing)

To use `awc` in your other projects straight from this checkout, link it
globally once:

```bash
cd /path/to/agentic-workflow-creator
bun run build
npm link
```

Then, in any project:

```bash
awc claude
```

Because the link is a symlink to the working copy — and templates are read
from it at runtime, not bundled — edits to the skill, agent templates, or
commands are live on the next `awc` run; only `src/` changes need a fresh
`bun run build`. Undo with `npm unlink -g agentic-workflow-creator`.

Alternatively, skip installing and run it by path (or alias it):

```bash
node /path/to/agentic-workflow-creator/dist/cli.js claude
```

To rehearse the real published install, `npm pack` builds the tarball and
`npm i -g ./agentic-workflow-creator-<version>.tgz` installs exactly what
would ship.

## Requirements

- Node.js >= 18
- At least one of the agents on your `PATH`:
  [Claude Code](https://docs.anthropic.com/en/docs/claude-code),
  [Codex](https://developers.openai.com/codex/cli),
  [opencode](https://opencode.ai)

## Development

Bun is the dev toolchain; the published output is plain Node-compatible ESM.

```bash
bun install
bun test            # unit tests
bun run typecheck   # tsc --noEmit
bun run build       # bundle to dist/cli.js
bun run smoke       # per installed agent: stage → spawn → cleanup against the real CLI, and verify the payload landed
```

See [SPEC.md](SPEC.md) for the full design.

## License

MIT
