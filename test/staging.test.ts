import { afterAll, describe, expect, test } from 'bun:test'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { stageClaude } from '../src/agents/claude'
import { stageCodex } from '../src/agents/codex'
import { stageOpencode } from '../src/agents/opencode'
import { hostNames } from '../src/hosts'
import { hostDir, sharedDir } from '../src/paths'
import { cleanup, readPrompt, shadow } from '../src/staging'

function freshTmp(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), 'awc-test-')), '.awc-tmp')
}

describe('stageClaude', () => {
  test('builds a plugin dir from the manifest plus the shared payload', () => {
    const tmp = freshTmp()
    const plugin = stageClaude(tmp)
    expect(existsSync(path.join(plugin, '.claude-plugin', 'plugin.json'))).toBe(
      true,
    )
    expect(
      existsSync(path.join(plugin, 'skills', 'workflow-creator', 'SKILL.md')),
    ).toBe(true)
    expect(existsSync(path.join(plugin, 'commands', 'awc-status.md'))).toBe(
      true,
    )
    expect(
      existsSync(
        path.join(plugin, 'skills', 'workflow-creator', 'assets', 'running.md'),
      ),
    ).toBe(true)
    cleanup(tmp)
  })

  test('replaces a stale temp folder from a previous hard kill', () => {
    const tmp = freshTmp()
    mkdirSync(tmp, { recursive: true })
    writeFileSync(path.join(tmp, 'stale-file'), 'leftover')
    stageClaude(tmp)
    expect(existsSync(path.join(tmp, 'stale-file'))).toBe(false)
    expect(existsSync(path.join(tmp, 'plugin'))).toBe(true)
    cleanup(tmp)
  })
})

// The env-var hosts resolve their real config dir at stage time, so every test
// below points them at a throwaway fixture. Without this they would shadow —
// and, before the payload copy learned to unlink first, overwrite — the
// developer's own ~/.codex or ~/.config/opencode.
const realEnv = new Map<string, string | undefined>()

function fakeHost(envVar: string, seed?: (dir: string) => void): string {
  if (!realEnv.has(envVar)) realEnv.set(envVar, process.env[envVar])
  const dir = mkdtempSync(path.join(tmpdir(), 'awc-fakehost-'))
  seed?.(dir)
  process.env[envVar] = dir
  return dir
}

afterAll(() => {
  for (const [envVar, value] of realEnv) {
    if (value === undefined) delete process.env[envVar]
    else process.env[envVar] = value
  }
})

// A user who already has a skill and command of the same name as the payload.
function seedColliding(skillsDir: string, statusPath: string) {
  return (dir: string) => {
    mkdirSync(path.join(dir, skillsDir, 'workflow-creator'), {
      recursive: true,
    })
    writeFileSync(
      path.join(dir, skillsDir, 'workflow-creator', 'SKILL.md'),
      'USER ORIGINAL',
    )
    const status = path.join(dir, statusPath)
    mkdirSync(path.dirname(status), { recursive: true })
    writeFileSync(status, 'USER ORIGINAL')
  }
}

const HOSTS = [
  {
    name: 'stageCodex',
    envVar: 'CODEX_HOME',
    stage: stageCodex,
    skills: 'skills',
    // Codex dropped $CODEX_HOME/prompts in 0.117.0, so the command ships as a
    // skill — a flat prompts/awc-status.md would never be read.
    status: path.join('skills', 'awc-status', 'SKILL.md'),
  },
  {
    name: 'stageOpencode',
    envVar: 'OPENCODE_CONFIG_DIR',
    stage: stageOpencode,
    skills: 'skill',
    status: path.join('command', 'awc-status.md'),
  },
]

for (const host of HOSTS) {
  describe(host.name, () => {
    const skillMd = path.join(host.skills, 'workflow-creator', 'SKILL.md')
    const statusMd = host.status

    test('places the payload under the host dir names', () => {
      const real = fakeHost(host.envVar)
      const tmp = freshTmp()
      const staged = host.stage(tmp)
      expect(existsSync(path.join(staged, skillMd))).toBe(true)
      expect(existsSync(path.join(staged, statusMd))).toBe(true)
      // Real files in the temp dir, not links that could resolve to the user's.
      // Every segment is checked: a symlinked parent would make an lstat on the
      // leaf alone report a plain file.
      for (const p of [skillMd, statusMd]) {
        let walked = staged
        for (const segment of p.split(path.sep)) {
          walked = path.join(walked, segment)
          expect(lstatSync(walked).isSymbolicLink()).toBe(false)
        }
      }
      expect(readFileSync(path.join(staged, skillMd), 'utf8')).toContain(
        'Workflow Creator',
      )
      cleanup(tmp)
      rmSync(real, { recursive: true, force: true })
    })

    test('stages nothing into a slot the host does not read', () => {
      const real = fakeHost(host.envVar)
      const tmp = freshTmp()
      const staged = host.stage(tmp)
      // Codex 0.117.0 removed $CODEX_HOME/prompts; a file left there is dead
      // weight that also makes an existence check pass for the wrong reason.
      expect(existsSync(path.join(staged, 'prompts'))).toBe(false)
      cleanup(tmp)
      rmSync(real, { recursive: true, force: true })
    })

    test('leaves a same-named user skill and command untouched', () => {
      const real = fakeHost(host.envVar, seedColliding(host.skills, statusMd))
      const tmp = freshTmp()
      const staged = host.stage(tmp)

      // The session gets the bundled copy...
      expect(readFileSync(path.join(staged, skillMd), 'utf8')).toContain(
        'Workflow Creator',
      )
      expect(readFileSync(path.join(staged, statusMd), 'utf8')).toContain(
        'workflow-creation session',
      )
      // ...and the user's originals are still their own.
      expect(readFileSync(path.join(real, skillMd), 'utf8')).toBe(
        'USER ORIGINAL',
      )
      expect(readFileSync(path.join(real, statusMd), 'utf8')).toBe(
        'USER ORIGINAL',
      )

      cleanup(tmp)
      expect(readFileSync(path.join(real, skillMd), 'utf8')).toBe(
        'USER ORIGINAL',
      )
      rmSync(real, { recursive: true, force: true })
    })

    test("links the user's other entries without copying them", () => {
      const real = fakeHost(host.envVar, (dir) => {
        writeFileSync(path.join(dir, 'auth.json'), '{"token":"secret"}')
        mkdirSync(path.join(dir, host.skills, 'mine'), { recursive: true })
        writeFileSync(
          path.join(dir, host.skills, 'mine', 'SKILL.md'),
          'user skill',
        )
      })
      const tmp = freshTmp()
      const staged = host.stage(tmp)
      expect(lstatSync(path.join(staged, 'auth.json')).isSymbolicLink()).toBe(
        true,
      )
      expect(
        lstatSync(path.join(staged, host.skills, 'mine')).isSymbolicLink(),
      ).toBe(true)
      cleanup(tmp)
      rmSync(real, { recursive: true, force: true })
    })
  })
}

describe('shadow', () => {
  test('links the real config and merges the named dirs', () => {
    const real = mkdtempSync(path.join(tmpdir(), 'awc-real-'))
    writeFileSync(path.join(real, 'auth.json'), '{"token":"secret"}')
    mkdirSync(path.join(real, 'sessions'))
    mkdirSync(path.join(real, 'skills', 'mine'), { recursive: true })
    writeFileSync(path.join(real, 'skills', 'mine', 'SKILL.md'), 'user skill')

    const tmp = freshTmp()
    const dest = path.join(tmp, 'home')
    shadow(real, dest, ['skills'])

    // Untouched entries are links back to the user's real files.
    expect(lstatSync(path.join(dest, 'auth.json')).isSymbolicLink()).toBe(true)
    expect(lstatSync(path.join(dest, 'sessions')).isSymbolicLink()).toBe(true)
    expect(readFileSync(path.join(dest, 'auth.json'), 'utf8')).toContain(
      'secret',
    )

    // A merged dir is real, and the user's own entries inside it are links.
    expect(lstatSync(path.join(dest, 'skills')).isSymbolicLink()).toBe(false)
    expect(lstatSync(path.join(dest, 'skills', 'mine')).isSymbolicLink()).toBe(
      true,
    )

    // Cleanup removes only the shadow; the real dir survives intact.
    cleanup(tmp)
    expect(existsSync(path.join(real, 'auth.json'))).toBe(true)
    expect(existsSync(path.join(real, 'skills', 'mine', 'SKILL.md'))).toBe(true)
  })

  test('tolerates a host the user has never configured', () => {
    const tmp = freshTmp()
    const dest = path.join(tmp, 'home')
    shadow(path.join(tmpdir(), 'awc-does-not-exist'), dest, ['skills'])
    expect(existsSync(path.join(dest, 'skills'))).toBe(true)
    cleanup(tmp)
  })
})

describe('the shared payload', () => {
  test('ships every agent template the catalog documents, and only those', () => {
    const skillDir = path.join(sharedDir(), 'skills', 'workflow-creator')
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
    // Reverse direction: every shipped template is documented in the catalog.
    for (const file of readdirSync(agentsDir)) {
      expect(catalogAgents).toContain(file)
    }
  })
})

describe('cleanup', () => {
  test('removes the temp folder and is idempotent', () => {
    const tmp = freshTmp()
    stageClaude(tmp)
    cleanup(tmp)
    expect(existsSync(tmp)).toBe(false)
    cleanup(tmp) // second call must not throw
  })
})

describe('readPrompt', () => {
  test('every host ships a trimmed initial prompt', () => {
    for (const host of hostNames()) {
      const prompt = readPrompt(hostDir(host))
      expect(prompt.length).toBeGreaterThan(0)
      expect(prompt).toBe(prompt.trim())
    }
  })
})
