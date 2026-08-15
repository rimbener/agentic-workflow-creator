#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { runClaude } from './agents/claude'
import { type ParsedCli, parseCli } from './args'
import { packageJsonPath } from './paths'

const HELP = `awc — agentic-workflow-creator

Usage:
  awc <agent> [options] [-- <agent args...>]

Agents:
  claude          Launch Claude Code with the bundled workflow plugin

Options:
  --keep          Do not delete the temp folder on exit (debugging)
  --tmp-dir <p>   Temp folder location (default: ./.awc-tmp)
  -h, --help      Show this help
  -v, --version   Show version

Everything after \`--\` is passed through to the agent CLI verbatim.
`

function main(): void {
  let cli: ParsedCli
  try {
    cli = parseCli(process.argv.slice(2))
  } catch (err) {
    console.error(`awc: ${err instanceof Error ? err.message : String(err)}`)
    console.error('Run `awc --help` for usage.')
    process.exit(1)
  }

  if (cli.help) {
    console.log(HELP)
    return
  }
  if (cli.version) {
    const pkg = JSON.parse(readFileSync(packageJsonPath(), 'utf8'))
    console.log(pkg.version)
    return
  }

  switch (cli.agent) {
    case 'claude':
      runClaude({
        tmpDir: cli.tmpDir,
        keep: cli.keep,
        passthrough: cli.passthrough,
      })
      break
    case undefined:
      console.log(HELP)
      process.exit(1)
      break
    default:
      console.error(`awc: unknown agent "${cli.agent}" (available: claude)`)
      process.exit(1)
  }
}

main()
