import { parseArgs } from 'node:util'

export interface ParsedCli {
  agent: string | undefined
  keep: boolean
  tmpDir: string
  help: boolean
  version: boolean
  passthrough: string[]
}

export function parseCli(argv: string[]): ParsedCli {
  const sep = argv.indexOf('--')
  const own = sep === -1 ? argv : argv.slice(0, sep)
  const passthrough = sep === -1 ? [] : argv.slice(sep + 1)

  const { values, positionals } = parseArgs({
    args: own,
    options: {
      keep: { type: 'boolean', default: false },
      'tmp-dir': { type: 'string', default: '.awc-tmp' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: true,
  })

  return {
    agent: positionals[0],
    keep: values.keep,
    tmpDir: values['tmp-dir'],
    help: values.help,
    version: values.version,
    passthrough,
  }
}
