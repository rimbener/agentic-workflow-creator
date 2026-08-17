# awc — agentic-workflow-creator

Launch Claude Code pre-loaded with a curated set of skills, slash commands, and
scripts — without touching your global Claude configuration or your project's
`.claude/` directory.

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
2. Launches `claude --plugin-dir .awc-tmp/plugin` with an initial prompt, so the
   skills and commands are loaded **for this session only**.
3. Deletes `.awc-tmp/` when the session ends.

Add `.awc-tmp/` to your `.gitignore`. It normally never survives a session, but
a hard kill (`kill -9`, terminal crash) can leave it behind — the next run
cleans it up automatically.

## Usage

```
awc <agent> [options] [-- <agent args...>]

Agents:
  claude          Launch Claude Code with the bundled workflow plugin

Options:
  --keep          Do not delete the temp folder on exit (debugging)
  --tmp-dir <p>   Temp folder location (default: ./.awc-tmp)
  -h, --help      Show help
  -v, --version   Show version
```

Everything after `--` is passed through to the `claude` CLI verbatim, e.g.:

```bash
awc claude -- --model opus
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
commands are live on the next `awc claude`; only `src/` changes need a fresh
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
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) on your `PATH`

## Development

Bun is the dev toolchain; the published output is plain Node-compatible ESM.

```bash
bun install
bun test            # unit tests
bun run typecheck   # tsc --noEmit
bun run build       # bundle to dist/cli.js
bun run smoke       # full stage → spawn → cleanup cycle against the real claude CLI
```

See [SPEC.md](SPEC.md) for the full design.

## License

MIT
