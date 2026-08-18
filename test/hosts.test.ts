import { describe, expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { hostNames, parseHostsConf } from '../src/hosts'
import { templatesDir } from '../src/paths'

const row = 'claude\tclaude\thelp\tplugin\tskills/x.md\tcommands/x.md'

describe('hosts.conf', () => {
  test('roster matches templates/hosts and src/agents', () => {
    const names = hostNames().slice().sort()
    const dirs = readdirSync(path.join(templatesDir(), 'hosts')).sort()
    const agents = readdirSync(path.join(templatesDir(), '..', 'src', 'agents'))
      .filter((f) => f.endsWith('.ts') && f !== 'run.ts')
      .map((f) => f.replace(/\.ts$/, ''))
      .sort()
    expect(names).toEqual(dirs)
    expect(names).toEqual(agents)
  })

  test('parseHostsConf rejects wrong field counts, empty fields, and duplicates', () => {
    expect(() => parseHostsConf('claude\tonly-two\n')).toThrow(
      'expected 6 tab-separated fields',
    )
    expect(() => parseHostsConf(`${row}\n`)).not.toThrow()
    expect(() => parseHostsConf(`${row}\n${row}\n`)).toThrow(
      'duplicate host claude',
    )
    const emptyArgv = 'claude\t\thelp\tplugin\tskills/x.md\tcommands/x.md\n'
    expect(() => parseHostsConf(emptyArgv)).toThrow('empty field')
  })
})
