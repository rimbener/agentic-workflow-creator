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
    expect(existsSync(path.join(plugin, 'skills', 'grill-me', 'SKILL.md'))).toBe(
      true,
    )
    expect(existsSync(path.join(plugin, 'skills', 'grilling', 'SKILL.md'))).toBe(
      true,
    )
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
      expect(
        existsSync(path.join(staged, host.skills, 'grill-me', 'SKILL.md')),
      ).toBe(true)
      expect(
        existsSync(path.join(staged, host.skills, 'grilling', 'SKILL.md')),
      ).toBe(true)
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
  test('ships grill-me and grilling beside workflow-creator', () => {
    const skills = path.join(sharedDir(), 'skills')
    for (const name of ['grill-me', 'grilling', 'workflow-creator']) {
      expect(existsSync(path.join(skills, name, 'SKILL.md'))).toBe(true)
    }
  })

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

  // Every loop iteration spawns a fresh subagent, so an interviewer's only
  // memory of earlier turns is the log file its own prompt names. Losing that
  // — or letting the closing turn open one more entry — is what makes an
  // interview re-ask settled questions or run to max_iterations.
  test('every interviewer owns a named log, and the dialect says why', () => {
    const skillDir = path.join(sharedDir(), 'skills', 'workflow-creator')
    const catalog = readFileSync(
      path.join(skillDir, 'references', 'agent-catalog.md'),
      'utf8',
    )
    const logs = {
      story_partner: 'story-interview-log.md',
      spec_partner: 'spec-interview-log.md',
    }
    for (const [agent, log] of Object.entries(logs)) {
      const body = readFileSync(
        path.join(skillDir, 'assets', 'agents', `${agent}.md`),
        'utf8',
      )
      expect(body).toContain(log)
      expect(body).toContain('blank `A:`') // a question turn opens an entry
      expect(body).toContain('appends nothing') // the closing turn does not
      expect(catalog).toContain(log)
    }

    const running = readFileSync(
      path.join(skillDir, 'assets', 'running.md'),
      'utf8',
    )
    expect(running).toContain('Each iteration is a fresh subagent')
    // The log is the memory; the lead never rebuilds history into the prompt.
    expect(catalog).toContain('Pass `{{answer}}` and nothing more')
  })

  // spec_partner opens by reading user-story.md and treats it as settled, so
  // that file has to exist however lean the story step is. The three modes are
  // the dial; a capture hands what it could not settle to the spec interview
  // under `## Open questions` instead of leaving it unasked.
  test('the story step always writes user-story.md, in one of three modes', () => {
    const skillDir = path.join(sharedDir(), 'skills', 'workflow-creator')
    // Assert on squashed text: these files are hard-wrapped prose, so a
    // reflow must not fail the test.
    const read = (...parts: string[]) =>
      readFileSync(path.join(skillDir, ...parts), 'utf8').replace(/\s+/g, ' ')

    const story = read('assets', 'agents', 'story_partner.md')
    for (const mode of ['interview', 'capture', 'capture-and-confirm']) {
      expect(story).toContain(`\`${mode}\``)
    }
    expect(story).toContain('Source:') // the capture modes' argument
    expect(story).toContain('## Open questions') // the handover to the spec step

    // The spec side names the same handover, and halts when the file is absent
    // rather than interviewing the problem half itself.
    const spec = read('assets', 'agents', 'spec_partner.md')
    expect(spec).toContain('## Open questions')
    expect(spec).toContain('blocked -> .awc/tasks/<task>/user-story.md')

    // The pairing rule, the question that settles it, and the package check.
    const pairing = read('references', 'agent-catalog.md')
    expect(pairing).toContain('A spec step always has a story step')
    // Only `capture` leaves the heading behind — the pairing rule says which.
    expect(pairing).toContain('Whatever `capture` leaves undecided')
    // The description names the modes too, so the trim reaches frontmatter.
    expect(story).toContain('`capture-and-confirm` does both')
    expect(read('references', 'interview.md')).toContain(
      'ask where the problem statement comes from',
    )
    expect(read('SKILL.md')).toContain(
      'A workflow that specs anything writes `user-story.md` before it',
    )
  })

  // A loop closes on a token, so every turn of an interviewing mode has to end
  // in something the lead can act on: a question to relay, or the story plus
  // its token. capture ends in neither, which is why it may not sit in a loop
  // — the run would walk to max_iterations with the story already written.
  test('each story mode matches the node shape that can judge it', () => {
    const skillDir = path.join(sharedDir(), 'skills', 'workflow-creator')
    const read = (...parts: string[]) =>
      readFileSync(path.join(skillDir, ...parts), 'utf8').replace(/\s+/g, ' ')

    const story = read('assets', 'agents', 'story_partner.md')
    // Every interviewing turn asks or writes — never both, never neither.
    expect(story).toContain(
      'either **asks one question** or **writes the file**',
    )
    // capture-and-confirm turn 1 is that same choice, so a complete source
    // closes the loop on turn 1 instead of stranding it.
    expect(story).toContain('makes **turn 1** that closing turn')
    // capture returns no token: nothing for an `until:` to fire on.
    expect(story).toContain(
      '- In `capture`, the single run returns that line alone, judged by `expect:`. Add no token',
    )

    const catalog = read('references', 'agent-catalog.md')
    expect(catalog).toContain('could never close that loop')
    // One definition of "settled": a captured line counts as an answer does,
    // and an answer that decides a queued line strikes it. Two definitions
    // would send a later turn back over what the source already settled.
    expect(story).toContain('That record counts exactly as the entries do')
    expect(story).toContain('strike that one line')
    // The captured record is two lists, and only the queue half loses lines —
    // striking a settled area would put it back in the queue to be re-asked.
    expect(story).toContain('### Settled')
    expect(story).toContain('### Open')
    expect(story).toContain('Only the **Open** list')
    // Every block an interviewing mode owns carries the word, so a capture-only
    // copy can drop them by name instead of by judgement.
    expect(story).toContain("This step is an interviewing mode's alone")
    expect(story).toContain('In an interviewing mode, every **question** turn')
    // Protocols 3, 4, 5 and Communication carry a marked bullet per mode under
    // a mode-neutral opener, so a capture-only copy keeps neither the
    // one-question rule nor the closing-turn language only a loop can reach.
    expect(story).toContain('- In an interviewing mode, ask, **one question')
    expect(story).toContain('- In `capture-and-confirm`, the log opens with')
    expect(story).toContain('- In `capture-and-confirm`, the source got there')
    expect(story).toContain('- In `capture-and-confirm`, a source that settles')
    expect(story).toContain('- In `capture-and-confirm`, the turn that carries')
    expect(story).toContain('- In an interviewing mode, name it out loud')
    expect(story).toContain('- In an interviewing mode, it is the turn when')
    expect(story).toContain('- In an interviewing mode, a loop is waiting')
    expect(story).toContain('- In `capture`, take each area the source')
    expect(story).toContain('- In `capture`, a collision the source walks into')
    expect(story).toContain('- In `capture`, that turn is the single run')
    expect(story).toContain('- In `capture`, the single run returns that line')
    expect(catalog).toContain('a mode-neutral opener over one marked bullet')
    expect(catalog).toContain('Marks nest')
    expect(story).not.toContain('mode that can ask')
    expect(catalog).toContain('Trim a mode by name')
    // Only `capture` leaves the handover heading behind; the doc that offers
    // the choice has to say so, and that a full source closes on turn 1.
    const interviewRef = read('references', 'interview.md')
    expect(interviewRef).toContain('`capture` is the mode that hands work on')
    expect(interviewRef).toContain('closes on turn 1')
    // Both the design walk and the handoff check state the shape rule.
    expect(read('references', 'interview.md')).toContain(
      '`Request:`, `Source:`',
    )
    expect(read('SKILL.md')).toContain('it could never close one')
  })

  // What every mode needs sits above the marks, so a capture-only trim cannot
  // carry it off: the list of areas to cover, and the return line the node's
  // `expect:` matches. Losing either leaves a capture with nothing to extract,
  // or with no signal for the lead to judge.
  test('a capture-only trim keeps the areas and the return line', () => {
    const skillDir = path.join(sharedDir(), 'skills', 'workflow-creator')
    const read = (...parts: string[]) =>
      readFileSync(path.join(skillDir, ...parts), 'utf8').replace(/\s+/g, ' ')

    const story = read('assets', 'agents', 'story_partner.md')
    expect(story).toContain('**The areas a story settles.** Every mode covers')
    for (const area of [
      '**who**',
      '**what**',
      '**why**',
      '**success**',
      '**edges**',
    ]) {
      expect(story).toContain(area)
    }
    expect(story).toContain(
      "That line is what the node's `expect:` matches, in every mode",
    )
    expect(story).toContain('`user_story -> .awc/tasks/<task>/user-story.md`')
    // Both arguments are named where the agent reads them, so the handoff
    // check ("open each agent file") can enforce either one.
    expect(story).toContain('`Request:` carries the raw request')
    expect(story).toContain('`Source:` carries or names the raw material')
    // Inline request text IS the source; a path- or URL-shaped value that will
    // not open is a halt. Both halves say so where the agent reads them — the
    // §The source rule and the return convention it returns by.
    expect(story).toContain('A slash alone makes nothing a path')
    expect(story).toContain(
      'A path-shaped or URL-shaped `Source:` that will not open is a halt',
    )
    expect(story).toContain('A capture mode has one other return')
    // The catalog's capture shape decides the same way, or a creator following
    // it would pass a slug as a path and the step would halt on a real run.
    const catalogShape = read('references', 'agent-catalog.md')
    expect(catalogShape).toContain('The agent decides which by shape, narrowly')
    expect(catalogShape).toContain('one space-free token')
    expect(catalogShape).toContain('slug like `fix/login-redirect`')
    // An empty handover heading reads as work the spec step must go find.
    expect(story).toContain('left out entirely when the source settled')
    const catalog = read('references', 'agent-catalog.md')
    expect(catalog).toContain('sits above the marks and survives any trim')
    // The description lists the modes, so the trim has to reach it too.
    expect(catalog).toContain('**The frontmatter is part of the trim**')
    expect(read('SKILL.md')).toContain(
      'a `description:` naming only the modes the copy kept',
    )
    // The two ask-side prohibitions belong to the modes that ask.
    expect(story).toContain('- ❌ In an interviewing mode, never ask two')
  })
})

// A block is one bullet, one numbered protocol step, one table row, or one
// paragraph — the unit the catalog tells the skill to keep or drop whole.
// Indented continuations (including fenced examples) belong to the block above.
function markdownBlocks(md: string): string[] {
  const out: string[] = []
  let cur: string[] = []
  let prevBlank = true
  const push = () => {
    if (cur.join('\n').trim()) out.push(cur.join('\n'))
    cur = []
  }
  let fenced = false
  for (const line of md.split('\n')) {
    // A fenced example belongs to whatever introduced it — splitting inside one
    // would strand its lines in blocks of their own and survive any trim.
    const fence = /^\s*```/.test(line)
    const fresh =
      !fenced &&
      (/^\s*(?:[-*]|\d+\.)\s/.test(line) ||
        /^#{1,6}\s/.test(line) ||
        /^\|/.test(line) ||
        (prevBlank && line.trim() !== '' && !/^\s/.test(line)))
    if (fresh) push()
    if (fence) fenced = !fenced
    cur.push(line)
    prevBlank = line.trim() === ''
  }
  push()
  return out
}

// story_partner is trimmed per package, and the trim is by mark. These run the
// recipe the catalog gives — drop every block no surviving mode claims — and
// check what is left, which is what a phrase assertion on the base template
// cannot do.
describe('trimming story_partner by mark', () => {
  const story = readFileSync(
    path.join(
      sharedDir(),
      'skills',
      'workflow-creator',
      'assets',
      'agents',
      'story_partner.md',
    ),
    'utf8',
  )
  // The marks the catalog defines, and the recipe it gives: drop a block when
  // it carries a mark and no surviving mode claims it. Sentences marked for a
  // dropped mode inside a block you keep are trimmed by hand after — the
  // nesting rule — so this checks the block-level half of the trim.
  // Case-insensitive: a mark opening a sentence reads as "A capture mode …".
  const MARKED =
    /interviewing|`interview`|`capture`|`capture-and-confirm`|a capture mode/i
  // The frontmatter is rewritten rather than dropped (the catalog says so), and
  // a block under a marked `##` heading inherits that heading's mark — §The
  // source is a capture-mode section, and the catalog trims it as one.
  const body = story.replace(/^---\n[\s\S]*?\n---\n/, '')
  const marksOf = (block: string, heading: string) =>
    MARKED.test(block) ? block : MARKED.test(heading) ? heading : ''
  const trimTo = (surviving: RegExp) => {
    let heading = ''
    return markdownBlocks(body)
      .filter((block) => {
        if (/^##\s/.test(block)) heading = block
        const mark = marksOf(block, heading)
        return !mark || surviving.test(mark)
      })
      .join('\n')
      .replace(/\s+/g, ' ')
  }

  // Material no capture-only copy can act on: a log it never opens, a token it
  // never returns, an entry it never appends.
  const INTERVIEW_ONLY = [
    'story-interview-log.md',
    'USER_STORY_WRITTEN',
    'blank `A:`',
    'one question at a time',
  ]

  test('each mode row is marked with its own mode alone', () => {
    const rows = markdownBlocks(body).filter((b) => /^\| `[a-z-]+` \|/.test(b))
    expect(rows).toHaveLength(3)
    const others: Record<string, RegExp> = {
      interview: /`capture`|`capture-and-confirm`|a capture mode/i,
      capture: /`interview`|interviewing|`capture-and-confirm`/i,
      'capture-and-confirm': /`interview`|`capture`/i,
    }
    for (const row of rows) {
      const mode = row.match(/^\| `([a-z-]+)` \|/)?.[1] ?? ''
      const otherModes = others[mode]
      expect(otherModes).toBeDefined()
      expect({
        mode,
        leaks: otherModes?.test(row.slice(mode.length + 4)) ?? true,
      }).toMatchObject({ leaks: false })
    }
  })

  test('every interview-only block carries an interviewing mark', () => {
    for (const block of markdownBlocks(body)) {
      const token = INTERVIEW_ONLY.find((t) => block.includes(t))
      if (token) {
        expect({
          token,
          marked: /interviewing|`interview`/i.test(block),
          block,
        }).toMatchObject({ marked: true })
      }
    }
  })

  // The mirror: an interview-only copy drops the source, its halt and its
  // handover heading, and still keeps the story shape it writes.
  test('an interview-only copy drops the source and keeps the story shape', () => {
    const kept = trimTo(/interviewing|`interview`/i)
    expect(kept).toContain('## Acceptance criteria')
    expect(kept).toContain('**who** (which persona/user)')
    expect(kept).toContain('story-interview-log.md')
    expect(kept).toContain('USER_STORY_WRITTEN')
    for (const token of [
      '## Open questions',
      '`Source:` carries',
      'blocked ->',
      // no row advertising a mode this package has no node for
      '| `capture` |',
      '| `capture-and-confirm` |',
      // and no turn-1 source protocol it could never run
      'capture-and-confirm',
      '## From the source',
    ]) {
      expect(kept).not.toContain(token)
    }
  })

  // The middle mode keeps both halves: it reads a source and it interviews.
  test('a confirm-only copy keeps the source and the interview', () => {
    const kept = trimTo(/interviewing|`capture-and-confirm`|a capture mode/i)
    expect(kept).toContain('story-interview-log.md')
    expect(kept).toContain('## From the source')
    expect(kept).toContain('`Source:` carries or names the raw material')
    expect(kept).toContain('USER_STORY_WRITTEN')
    expect(kept).toContain('## Acceptance criteria')
    for (const token of [
      '`Request:` carries',
      // the handover heading is `capture`'s output; a confirm story has none
      'under `## Open questions`',
      '| `interview` |',
      '| `capture` |',
    ]) {
      expect(kept).not.toContain(token)
    }
  })

  test('a capture-only copy keeps the areas, the story shape and the signal', () => {
    const kept = trimTo(/`capture`|a capture mode/i)
    // What every mode needs survives...
    expect(kept).toContain('**who** (which persona/user)')
    expect(kept).toContain('`user_story -> .awc/tasks/<task>/user-story.md`')
    expect(kept).toContain('## Acceptance criteria')
    expect(kept).toContain('`Source:` carries or names the raw material')
    expect(kept).toContain('## Open questions')
    // ...including the fact lookup, which is every mode's, and the mode row.
    expect(kept).toContain('**Look facts up yourself.**')
    expect(kept).toContain('| `capture` | A single run, no questions')
    // ...and nothing an unlooped single run could not do is left behind.
    for (const token of INTERVIEW_ONLY) expect(kept).not.toContain(token)
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
