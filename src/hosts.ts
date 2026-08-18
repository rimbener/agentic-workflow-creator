import { readFileSync } from 'node:fs'
import { hostsConfPath } from './paths'

export type Host = {
  name: string
  argv: string[]
  help: string
  smokeDir: string
  smokeSkill: string
  smokeStatus: string
}

export function parseHostsConf(text: string): Host[] {
  const hosts: Host[] = []
  const seen = new Set<string>()
  for (const [i, line] of text.split('\n').entries()) {
    const n = i + 1
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) continue
    const cols = line.split('\t')
    if (cols.length !== 6) {
      throw new Error(
        `hosts.conf:${n}: expected 6 tab-separated fields, got ${cols.length}`,
      )
    }
    const [name, argv, help, smokeDir, smokeSkill, smokeStatus] = cols
    if (!name || !argv || !help || !smokeDir || !smokeSkill || !smokeStatus) {
      throw new Error(`hosts.conf:${n}: empty field`)
    }
    if (seen.has(name)) {
      throw new Error(`hosts.conf:${n}: duplicate host ${name}`)
    }
    seen.add(name)
    hosts.push({
      name,
      argv: argv.split(' ').filter(Boolean),
      help,
      smokeDir,
      smokeSkill,
      smokeStatus,
    })
  }
  if (hosts.length === 0) throw new Error('hosts.conf: no hosts')
  return hosts
}

export function loadHosts(): Host[] {
  return parseHostsConf(readFileSync(hostsConfPath(), 'utf8'))
}

export function hostNames(): string[] {
  return loadHosts().map((h) => h.name)
}
