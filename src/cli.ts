#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { runClaude } from './agents/claude'
import { runCodex } from './agents/codex'
import { runOpencode } from './agents/opencode'
import { type ParsedCli, parseCli } from './args'
import { loadHosts } from './hosts'
import { mode } from './mode'
import { packageJsonPath } from './paths'

const RUNNERS: Record<string, typeof runClaude> = {
  claude: runClaude,
  codex: runCodex,
  opencode: runOpencode,
}

function helpText(): string {
  const hosts = loadHosts()
  const width = Math.max(...hosts.map((h) => h.name.length))
  const agents = hosts
    .map((h) => `  ${h.name.padEnd(width)}    ${h.help}`)
    .join('\n')
  return `awc — agentic-workflow-creator

Usage:
  awc <agent> [options] [-- <agent args...>]

Agents:
${agents}

Options:
  --upgrade       Open the session on workflow-upgrader, to change a workflow
                  package this repo already has (default: create a new one)
  --edit          Open the session on workflow-runner, to make a change to
                  this repo by running a workflow package it already has
                  (mutually exclusive with --upgrade)
  --keep          Do not delete the temp folder on exit (debugging)
  --tmp-dir <p>   Temp folder location (default: ./.awc-tmp)
  -h, --help      Show this help
  -v, --version   Show version

Everything after \`--\` is passed through to the agent CLI verbatim.
`
}

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
    console.log(helpText())
    return
  }
  if (cli.version) {
    const pkg = JSON.parse(readFileSync(packageJsonPath(), 'utf8'))
    console.log(pkg.version)
    return
  }

  if (cli.agent === undefined) {
    console.log(helpText())
    process.exit(1)
  }

  const hosts = loadHosts()
  for (const h of hosts) {
    if (!RUNNERS[h.name]) {
      console.error(
        `awc: agents-cli.conf names "${h.name}" but no runner is registered`,
      )
      process.exit(1)
    }
  }

  const run = RUNNERS[cli.agent]
  if (!run) {
    console.error(
      `awc: unknown agent "${cli.agent}" (available: ${hosts.map((h) => h.name).join(', ')})`,
    )
    process.exit(1)
  }

  run({
    tmpDir: cli.tmpDir,
    keep: cli.keep,
    mode: mode(cli.upgrade, cli.edit),
    passthrough: cli.passthrough,
  })
}

main()
