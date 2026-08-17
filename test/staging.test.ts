import { describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { templatesDir } from '../src/paths'
import { cleanup, readPrompt, stage } from '../src/staging'

const claudeTemplate = path.join(templatesDir(), 'claude')

function freshTmp(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), 'awc-test-')), '.awc-tmp')
}

describe('stage', () => {
  test('copies the plugin into the temp folder', () => {
    const tmp = freshTmp()
    stage(tmp, claudeTemplate)
    expect(
      existsSync(path.join(tmp, 'plugin', '.claude-plugin', 'plugin.json')),
    ).toBe(true)
    expect(
      existsSync(
        path.join(tmp, 'plugin', 'skills', 'workflow-creator', 'SKILL.md'),
      ),
    ).toBe(true)
    expect(
      existsSync(path.join(tmp, 'plugin', 'commands', 'awc-status.md')),
    ).toBe(true)
    expect(
      existsSync(
        path.join(
          tmp,
          'plugin',
          'skills',
          'workflow-creator',
          'assets',
          'running.md',
        ),
      ),
    ).toBe(true)
    cleanup(tmp)
  })

  test('stages every agent template the catalog documents, and only those', () => {
    const tmp = freshTmp()
    stage(tmp, claudeTemplate)
    const skillDir = path.join(tmp, 'plugin', 'skills', 'workflow-creator')
    const catalog = readFileSync(
      path.join(skillDir, 'references', 'agent-catalog.md'),
      'utf8',
    )
    // Table rows look like: | `agent_name` | ... |
    const catalogAgents = [...catalog.matchAll(/^\| `([a-z_]+)` \|/gm)].map(
      (m) => `${m[1]}.md`,
    )
    expect(catalogAgents.length).toBeGreaterThan(0)
    const agentsDir = path.join(skillDir, 'assets', 'agents')
    for (const agent of catalogAgents) {
      expect(existsSync(path.join(agentsDir, agent))).toBe(true)
    }
    // Reverse direction: every staged template is documented in the catalog.
    for (const file of readdirSync(agentsDir)) {
      expect(catalogAgents).toContain(file)
    }
    cleanup(tmp)
  })

  test('replaces a stale temp folder from a previous hard kill', () => {
    const tmp = freshTmp()
    mkdirSync(tmp, { recursive: true })
    writeFileSync(path.join(tmp, 'stale-file'), 'leftover')
    stage(tmp, claudeTemplate)
    expect(existsSync(path.join(tmp, 'stale-file'))).toBe(false)
    expect(existsSync(path.join(tmp, 'plugin'))).toBe(true)
    cleanup(tmp)
  })
})

describe('cleanup', () => {
  test('removes the temp folder and is idempotent', () => {
    const tmp = freshTmp()
    stage(tmp, claudeTemplate)
    cleanup(tmp)
    expect(existsSync(tmp)).toBe(false)
    cleanup(tmp) // second call must not throw
  })
})

describe('readPrompt', () => {
  test('returns the trimmed initial prompt', () => {
    const prompt = readPrompt(claudeTemplate)
    expect(prompt.length).toBeGreaterThan(0)
    expect(prompt).toBe(prompt.trim())
  })
})
