import { parseArgs } from 'node:util'

export interface ParsedCli {
  agent: string | undefined
  keep: boolean
  upgrade: boolean
  edit: boolean
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
      upgrade: { type: 'boolean', default: false },
      edit: { type: 'boolean', default: false },
      'tmp-dir': { type: 'string', default: '.awc-tmp' },
      help: { type: 'boolean', short: 'h', default: false },
      version: { type: 'boolean', short: 'v', default: false },
    },
    allowPositionals: true,
  })

  // Each flag names the one skill the session opens on, so together they
  // name nothing.
  if (values.upgrade && values.edit) {
    throw new Error('--upgrade and --edit cannot be combined')
  }

  return {
    agent: positionals[0],
    keep: values.keep,
    upgrade: values.upgrade,
    edit: values.edit,
    tmpDir: values['tmp-dir'],
    help: values.help,
    version: values.version,
    passthrough,
  }
}
