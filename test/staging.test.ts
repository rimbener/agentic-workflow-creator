import { afterAll, describe, expect, test } from 'bun:test'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { claudeCommand, stageClaude } from '../src/agents/claude'
import { codexCommand, stageCodex } from '../src/agents/codex'
import { opencodeCommand, stageOpencode } from '../src/agents/opencode'
import type { AgentOptions } from '../src/agents/run'
import { hostNames } from '../src/hosts'
import type { Mode } from '../src/mode'
import { hostDir, sharedDir } from '../src/paths'
import { cleanup, readPrompt, shadow } from '../src/staging'

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

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
    expect(
      existsSync(path.join(plugin, 'skills', 'grill-me', 'SKILL.md')),
    ).toBe(true)
    expect(
      existsSync(path.join(plugin, 'skills', 'grilling', 'SKILL.md')),
    ).toBe(true)
    expect(existsSync(path.join(plugin, 'commands', 'awc-status.md'))).toBe(
      true,
    )
    // A create session gets neither change skill: nothing extra competes for
    // triggering when nothing exists to change.
    for (const skill of ['workflow-upgrader', 'workflow-editor']) {
      expect(existsSync(path.join(plugin, 'skills', skill, 'SKILL.md'))).toBe(
        false,
      )
    }
    expect(
      existsSync(
        path.join(plugin, 'skills', 'workflow-creator', 'assets', 'running.md'),
      ),
    ).toBe(true)
    cleanup(tmp)
  })

  // Each change mode stages its own skill beside the creator — both read the
  // dialect and the agent bases out of the creator's folder, so that pair is
  // staged together or those paths dangle — and never the other change skill:
  // the upgrader and the editor are deliberately separate.
  test('each change mode stages its own skill beside the creator', () => {
    for (const { mode, stages, spares } of [
      {
        mode: 'upgrade',
        stages: 'workflow-upgrader',
        spares: 'workflow-editor',
      },
      { mode: 'edit', stages: 'workflow-editor', spares: 'workflow-upgrader' },
    ] as const) {
      const tmp = freshTmp()
      const plugin = stageClaude(tmp, mode)
      for (const skill of [stages, 'workflow-creator']) {
        expect({
          mode,
          skill,
          staged: existsSync(path.join(plugin, 'skills', skill, 'SKILL.md')),
        }).toEqual({ mode, skill, staged: true })
      }
      expect(existsSync(path.join(plugin, 'skills', spares, 'SKILL.md'))).toBe(
        false,
      )
      expect(existsSync(path.join(plugin, 'commands', 'awc-status.md'))).toBe(
        true,
      )
      cleanup(tmp)
    }
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
    for (const name of [
      'workflow-creator',
      'workflow-upgrader',
      'workflow-editor',
    ]) {
      mkdirSync(path.join(dir, skillsDir, name), { recursive: true })
      writeFileSync(
        path.join(dir, skillsDir, name, 'SKILL.md'),
        'USER ORIGINAL',
      )
    }
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

    test('stages each change skill only for its own mode', () => {
      const real = fakeHost(host.envVar)
      const tmp = freshTmp()
      const upgrader = path.join(host.skills, 'workflow-upgrader', 'SKILL.md')
      const editor = path.join(host.skills, 'workflow-editor', 'SKILL.md')

      const created = host.stage(tmp)
      expect(existsSync(path.join(created, upgrader))).toBe(false)
      expect(existsSync(path.join(created, editor))).toBe(false)
      cleanup(tmp)

      // Each mode brings its own skill beside the creator and spares the
      // other's — the upgrader and the editor never ship together.
      for (const [mode, stages, spares] of [
        ['upgrade', upgrader, editor],
        ['edit', editor, upgrader],
      ] as const) {
        const staged = host.stage(tmp, mode)
        expect({ mode, staged: existsSync(path.join(staged, stages)) }).toEqual(
          { mode, staged: true },
        )
        expect(existsSync(path.join(staged, skillMd))).toBe(true)
        expect(existsSync(path.join(staged, spares))).toBe(false)
        cleanup(tmp)
      }
      rmSync(real, { recursive: true, force: true })
    })

    // A user with their own workflow-upgrader or workflow-editor skill has it
    // shadowed in as a symlink, so "is it absent" has to mean "no real file
    // of ours", not "no entry" — and the mode that stages the real copy still
    // has to unlink that link rather than write through it into their skill.
    // Both change skills get the same treatment: each is the payload of its
    // own mode, and each is a name a user may own.
    test('leaves a same-named user change skill alone until its mode', () => {
      const real = fakeHost(host.envVar, seedColliding(host.skills, statusMd))
      const tmp = freshTmp()
      for (const [mode, name, title] of [
        ['upgrade', 'workflow-upgrader', 'Workflow Upgrader'],
        ['edit', 'workflow-editor', 'Workflow Editor'],
      ] as const) {
        const skill = path.join(host.skills, name, 'SKILL.md')

        const created = host.stage(tmp)
        expect(readFileSync(path.join(created, skill), 'utf8')).toBe(
          'USER ORIGINAL',
        )
        expect(
          lstatSync(path.join(created, host.skills, name)).isSymbolicLink(),
        ).toBe(true)
        cleanup(tmp)

        const staged = host.stage(tmp, mode)
        expect(readFileSync(path.join(staged, skill), 'utf8')).toContain(title)
        expect(lstatSync(path.join(staged, skill)).isSymbolicLink()).toBe(false)
        cleanup(tmp)

        expect(readFileSync(path.join(real, skill), 'utf8')).toBe(
          'USER ORIGINAL',
        )
      }
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
        'awc session',
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
  test('ships the grill aids and both change skills beside the creator', () => {
    const skills = path.join(sharedDir(), 'skills')
    for (const name of [
      'grill-me',
      'grilling',
      'workflow-creator',
      'workflow-upgrader',
      'workflow-editor',
    ]) {
      expect(existsSync(path.join(skills, name, 'SKILL.md'))).toBe(true)
    }
  })

  // The SKILL.md bodies are fixtures for the tests below; read each once.
  const skillBody = (name: string) =>
    readFileSync(
      path.join(sharedDir(), 'skills', name, 'SKILL.md'),
      'utf8',
    ).replace(/\s+/g, ' ')
  const creatorBody = skillBody('workflow-creator')
  const upgraderBody = skillBody('workflow-upgrader')
  const editorBody = skillBody('workflow-editor')

  // No mode stages a skill that runs a package — running is the package's own
  // launchers' job — so a "use my workflow to build X" ask landing in an
  // authoring session must bounce to those launchers, never be improvised.
  test('the authoring skills hand a run request to the launchers', () => {
    for (const body of [creatorBody, upgraderBody, editorBody]) {
      expect(body).toContain('`.claude/commands/<name>.md` and its siblings')
    }
  })

  // A change request landing on the creator hands over to whichever change
  // skill is loaded — the creator ships in every mode, so it has to know both
  // by name; bouncing the user out to another flag while the right skill sits
  // loaded is the failure this pin exists to prevent.
  test('the creator hands a change request to the loaded change skill', () => {
    expect(creatorBody).toContain(
      'give it the request rather than sending the user anywhere',
    )
    expect(creatorBody).toContain('workflow-upgrader')
    expect(creatorBody).toContain('workflow-editor')
  })

  // The editor and the upgrader are deliberately separate skills — the
  // upgrader grows its own functionality — so the editor repeats what it
  // needs instead of citing the upgrader (whose folder is never staged in an
  // --edit session), hands audit-shaped work to `--upgrade`, and keeps the
  // two promises that make an ungated apply safe.
  test('the editor stands alone and keeps its write-gate promises', () => {
    expect(editorBody).not.toContain('../workflow-upgrader/')
    expect(editorBody).toContain('awc <agent> --upgrade')
    expect(editorBody).toContain(
      'Anything beyond their words still needs a yes',
    )
    expect(editorBody).toContain('never compressed')
    // With no plan gate, the end-to-end diff read is the one mechanism that
    // catches a drive-by, and the launch-path check must fit an in-place
    // package (three launchers, no script).
    expect(editorBody).toContain('the diff is the change')
    expect(editorBody).toContain('read `git diff`')
    expect(editorBody).toContain('where it exists')
    // A silent ../workflow-creator/ read failure has a recovery and, failing
    // that, a disclosure — quietly applying unvalidated changes is the one
    // degraded behavior this skill cannot afford.
    expect(editorBody).toContain('the way your host exposes its loaded skills')
    expect(editorBody).toContain('working degraded')
    // The ripple and untrim knowledge the editor repeats instead of citing —
    // the sentences an ungated apply leans on hardest, so the ones that must
    // not rot: the rename row, the when:-sweep on removal, the diff-first
    // untrim habit that spares hand-edits, and the strict package shape.
    expect(editorBody).toContain('Renaming the workflow')
    expect(editorBody).toContain(
      'the `when:` predicate and the script only that node ran',
    )
    expect(editorBody).toContain('diff the packaged copy against')
    expect(editorBody).toContain('never by regenerating the file from the base')
    expect(editorBody).toContain('`<name>.yaml`')
    // The run hand-off gives a paste-ready command, not a bare path.
    expect(editorBody).toContain('inputs already filled')
    // The upgrader, in turn, never leans on the editor (the flag it may
    // offer, `awc <agent> --edit`, names no skill directory).
    expect(upgraderBody).not.toContain('workflow-editor')
    expect(upgraderBody).not.toContain('../workflow-editor/')
  })

  // Both change skills borrow the dialect, the validation checklist and the
  // agent bases from `../workflow-creator/` rather than forking them, which
  // only works because every host stages skills as flat siblings. A path that
  // has moved fails silently at run time — the model just reads nothing — so
  // every citation is checked here against the real files.
  test('every ../workflow-creator/ path a change skill cites resolves', () => {
    const skills = path.join(sharedDir(), 'skills')
    for (const name of ['workflow-upgrader', 'workflow-editor']) {
      const cited = new Set<string>()
      for (const file of walk(path.join(skills, name))) {
        const text = readFileSync(file, 'utf8')
        for (const m of text.matchAll(
          /\.\.\/workflow-creator\/([\w./-]*[\w/])/g,
        )) {
          const ref = m[1]
          if (ref) cited.add(ref)
        }
      }
      expect(cited.size).toBeGreaterThan(0)
      for (const ref of cited) {
        const target = path.join(skills, 'workflow-creator', ref)
        // A citation ending in `/` names a directory of bases; one with an
        // extension names a file. Checking the kind keeps a file that became a
        // directory (or the reverse) from passing on existence alone. A
        // citation written with a `<placeholder>` filename resolves only to
        // its directory, so a renamed agent template is caught by the catalog
        // cross-check below, not here.
        const kind = existsSync(target)
          ? statSync(target).isDirectory()
            ? 'dir'
            : 'file'
          : 'missing'
        expect({ skill: name, ref, kind }).toEqual({
          skill: name,
          ref,
          kind: ref.endsWith('/') ? 'dir' : 'file',
        })
      }
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

  // The task trail is two-tiered while a run is live: only the pair a human
  // approves sits at the task directory's root, everything else in tmp/. An
  // agent naming a bare .awc/tasks/<task>/ path would write outside both, and
  // the finish node that archives the trail would leave it behind.
  test('every agent writes into the in-progress trail, and one node archives it', () => {
    const skillDir = path.join(sharedDir(), 'skills', 'workflow-creator')
    const agentsDir = path.join(skillDir, 'assets', 'agents')
    const read = (...parts: string[]) =>
      readFileSync(path.join(skillDir, ...parts), 'utf8')

    for (const file of readdirSync(agentsDir)) {
      const body = readFileSync(path.join(agentsDir, file), 'utf8')
      // The old flat path, which is a prefix of neither tier.
      expect(body).not.toContain('.awc/tasks/<task>/')
      // Only the lead reports the archived location; every other agent works
      // against the live trail.
      if (file !== 'workflow_lead.md') {
        expect(body).not.toContain('.awc/tasks/done/')
      }
    }
    // The lead is copied unchanged into every package, so its end line names
    // the archive as the trail case rather than the only one.
    const lead = readFileSync(path.join(agentsDir, 'workflow_lead.md'), 'utf8')
    expect(lead).toContain('.awc/tasks/done/<task>/')
    expect(lead).not.toContain('complete -> .awc/tasks/done/<task>/')

    // The two files a human approves sit a level above tmp/, so every agent
    // that reads or writes them has to be told where they are — a blanket
    // tmp/ prefix would send a builder looking for the contract in the
    // scratch directory. (finish-task.test.ts drives the script itself.)
    for (const file of [
      'dod_validator.md',
      'implementer.md',
      'implementer_tdd.md',
      'reviewer_engineering.md',
      'reviewer_slice.md',
      'spec_partner.md',
      'spec_reviewer.md',
      'unit_test_writer.md',
    ]) {
      const body = readFileSync(path.join(agentsDir, file), 'utf8').replace(
        /\s+/g,
        ' ',
      )
      expect(body).toContain('`spec.md` and `acceptance-criteria.md`')
      expect(body).toContain('.awc/tasks/in-progress/<task>/`')
    }

    // The move is a node running a script, so the lead never relocates a file.
    expect(existsSync(path.join(skillDir, 'assets', 'finish-task.sh'))).toBe(
      true,
    )
    // The reviewers record their verdicts through this script; a package
    // missing the copy leaves the one-line verdict file unwritten.
    expect(
      existsSync(path.join(skillDir, 'assets', 'write-verdict-file.sh')),
    ).toBe(true)
    // A `run:` command executes from the launch directory, not beside the
    // YAML, so the canonical node has to carry the package-relative path.
    for (const doc of [
      read('SKILL.md'),
      read('references', 'agent-catalog.md'),
      read('assets', 'running.md'),
    ]) {
      expect(doc).toContain('workflows/')
      expect(doc).toMatch(/workflows\/[^\s`]+\/scripts\/finish-task\.sh/)
    }
    // running.md ships inside every package, so it carries the layout the
    // lead reads at run time.
    const running = read('assets', 'running.md')
    expect(running).toContain('.awc/tasks/in-progress/<task>/')
    expect(running).toContain('.awc/tasks/done/<task>/')
  })

  // The verdict writer threads through three documents that have to agree,
  // or a generated package copies no script, grants no shell, or passes no
  // path — and the one-line verdict file never appears for a guard to grep.
  test('the verdict writer is shipped, granted shell, and passed by path', () => {
    const skillDir = path.join(sharedDir(), 'skills', 'workflow-creator')
    const read = (...parts: string[]) =>
      readFileSync(path.join(skillDir, ...parts), 'utf8')
    for (const reviewer of [
      'spec_reviewer.md',
      'reviewer_slice.md',
      'reviewer_engineering.md',
    ]) {
      const body = read('assets', 'agents', reviewer)
      expect(body).toContain('Verdict-writer:')
      expect(body).toContain('write-verdict-file.sh')
      // The writer's path is an invocation argument — never a literal the
      // tailoring would have to remember to rewrite.
      expect(body).not.toContain('workflows/<name>')
    }
    const catalog = read('references', 'agent-catalog.md')
    expect(catalog).toContain(
      'the one command they run is the package\'s `scripts/write-verdict-file.sh`',
    )
    // The producer has a consumer: the canonical spec-review shape guards
    // its fix step with a grep of the verdict file, not the review trail.
    expect(catalog).toContain('grep -qx CHANGES_REQUESTED')
    const skill = read('SKILL.md')
    expect(skill).toContain('Verdict-writer:')
    expect(skill).toContain('[read, search, edit, web, shell]')
    // The old teaching — reviewers need no shell — must not survive in the
    // document generated scopes are modeled from.
    expect(skill.replace(/\s+/g, ' ')).not.toContain('needs no `shell`')
    // The change skills ship the base and know the agent-invoked exception.
    const upgrader = readFileSync(
      path.join(sharedDir(), 'skills', 'workflow-upgrader', 'SKILL.md'),
      'utf8',
    )
    const editor = readFileSync(
      path.join(sharedDir(), 'skills', 'workflow-editor', 'SKILL.md'),
      'utf8',
    )
    for (const body of [upgrader, editor]) {
      expect(body).toContain('write-verdict-file.sh')
      expect(body).toContain('Verdict-writer:')
    }
    // The audit walk lives in inventory.md — its orphan and dangling lists
    // must both know the writer, or the same pass that adopts it flags it
    // unused or lets a typo'd prompt path through.
    const inventory = readFileSync(
      path.join(
        sharedDir(),
        'skills',
        'workflow-upgrader',
        'references',
        'inventory.md',
      ),
      'utf8',
    ).replace(/\s+/g, ' ')
    expect(inventory).toContain('or reviewer `Verdict-writer:` names it')
    expect(inventory).toContain(
      'a `Verdict-writer:` argument naming a script the package doesn\'t contain',
    )
    // The writer path travels in the prompt, not in an agent file — both
    // skills' orphan wording says so.
    const flat = (s: string) => s.replace(/\s+/g, ' ')
    expect(flat(upgrader)).toContain("named in a node's `Verdict-writer:` argument")
    expect(flat(editor)).toContain("named in a node's `Verdict-writer:` argument")
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
    // running.md ships into every package, so the lead-facing wording has to
    // carry the same rule the catalog states — not a vaguer paraphrase.
    expect(running).toContain(
      "reconstructing earlier turns into the prompt is the agent's log's job",
    )
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
    expect(spec).toContain(
      'blocked -> .awc/tasks/in-progress/<task>/tmp/user-story.md',
    )

    // The pairing rule, the question that settles it, and the package check.
    const pairing = read('references', 'agent-catalog.md')
    expect(pairing).toContain(
      'A spec step that reads `user-story.md` has a story step',
    )
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

  // The slice review diffs without guessing a ref: slice 1 from the Base:
  // argument, later slices from the closing-commit line the previous slice's
  // fix step wrote into its build record. The three sides of that handoff —
  // the reviewer that reads it, the builders that write it, and the catalog
  // pairing that makes an authored builder write it too — must all name the
  // same field, or a generated package's reviewer has nothing to read.
  test('the slice-diff base is a named handoff, never a guessed ref', () => {
    const skillDir = path.join(sharedDir(), 'skills', 'workflow-creator')
    const read = (...parts: string[]) =>
      readFileSync(path.join(skillDir, ...parts), 'utf8').replace(/\s+/g, ' ')

    const reviewer = read('assets', 'agents', 'reviewer_slice.md')
    expect(reviewer).toContain('Base: <base>')
    expect(reviewer).toContain('`closing-commit: <hash>`')
    // A record without the line is a broken trail: the reviewer blocks the
    // run rather than filing a finding the current builder cannot own —
    // CHANGES_REQUESTED sits in the loop's expect: and would spin to the cap.
    expect(reviewer).toContain('no `closing-commit:` line is a broken trail')
    expect(reviewer).toContain('no closing-commit line')

    // The closing-commit home is the closer's record only. `tests-<N>.md` is
    // the test writer's criterion map — unit_test_writer never writes the
    // line — so listing it as a spelling here would send the reviewer to a
    // record with no hash and block a healthy split-pairing run.
    expect(reviewer).toContain(
      "that slice's own closer record — `tdd-<N-1>.md` / `implementation-<N-1>.md`",
    )
    expect(reviewer).not.toContain('tests-<N-1>')
    // The reviewer expects exactly one bookkeeping change in the diff — the
    // previous slice's record, nothing broader (every map and review file
    // lives under tmp/ too), and none on slice 1, which has no trail yet.
    expect(reviewer).toContain('After slice 1, the diff also carries')
    expect(reviewer).toContain(
      'that one file, the record you read the hash from, is trail bookkeeping: raise no finding on it',
    )

    // Both committing builders end their record with the same named line,
    // commit that record update as its own trail commit (a dirty record
    // bleeds into the next slice's diff), and hold the loop-ending token
    // until after it — on the last slice nothing runs after the token.
    for (const builder of ['implementer.md', 'implementer_tdd.md']) {
      const text = read('assets', 'agents', builder)
      expect(text).toContain('`closing-commit: <hash>` line')
      expect(text).toContain('as its own small trail commit')
      expect(text).toContain(
        'after the trail commit, append `<promise>DONE</promise>`',
      )
    }

    // The catalog states the pairing, so an authored builder in a slice loop
    // inherits the obligation, and the canonical shape passes the slice
    // review its Base:.
    const catalog = read('references', 'agent-catalog.md')
    expect(catalog).toContain(
      'pairs its reviewer with a hash-recording fix step',
    )
    // The catalog's closer-record list stays exactly these two spellings,
    // and it passes the trail-commit obligation on to authored builders.
    expect(catalog).toContain(
      '(`implementation-<N>.md` / `tdd-<N>.md`), and slice 1 from `Base:`',
    )
    expect(catalog).toContain(
      'commits that record update too as its own small trail commit',
    )
    expect(catalog).toContain(
      'Mode: review-slice. Slice: {{iteration}}. Commands: {{test_command}}. Base: {{base}}.',
    )
    // The interview names Base: where slice reviews are chosen, so a
    // slice-only workflow still declares the ref slice 1 diffs against.
    expect(read('references', 'interview.md')).toContain(
      'its node passes `Base:`',
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
    // The captured record is two lists: the queue loses a line to each answer,
    // and a settled line is struck only when it proves wrong — the strike
    // requeues the area rather than silently rewriting the record.
    expect(story).toContain('### Settled')
    expect(story).toContain('### Open')
    expect(story).toContain('Only the **Open** list')
    expect(story).toContain('struck only when it proves wrong')
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
    expect(story).toContain(
      '`user_story -> .awc/tasks/in-progress/<task>/tmp/user-story.md`',
    )
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
    expect(kept).toContain(
      '`user_story -> .awc/tasks/in-progress/<task>/tmp/user-story.md`',
    )
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

// The upgrader's evals grade a diff, so their fixtures are packages rather than
// bare repos, and each eval names the one behavior it exists to catch. Both are
// silent failures otherwise: a renamed fixture or a dropped expectation key
// surfaces only when someone next runs an eval.
describe('the upgrader eval material', () => {
  const workspace = path.join(
    import.meta.dir,
    '..',
    'workflow-upgrader-workspace',
  )
  const evals = JSON.parse(
    readFileSync(path.join(workspace, 'evals', 'evals.json'), 'utf8'),
  )

  test('every eval points at a fixture that is a real package', () => {
    expect(evals.evals.length).toBeGreaterThan(0)
    for (const e of evals.evals as { name: string; files: string[] }[]) {
      expect(e.files.length).toBeGreaterThan(0)
      for (const f of e.files) {
        const fixture = path.join(workspace, f)
        // A fixture with no package is a creation prompt wearing an upgrade's
        // clothes — the whole skill starts by locating one.
        const workflows = path.join(fixture, 'workflows')
        expect({ eval: e.name, hasWorkflows: existsSync(workflows) }).toEqual({
          eval: e.name,
          hasWorkflows: true,
        })
        const pkg = readdirSync(workflows)[0] ?? ''
        expect(existsSync(path.join(workflows, pkg, 'running.md'))).toBe(true)
      }
    }
  })

  test('the keys that grade upgrade-only behavior are all present', () => {
    const names: string[] = evals.evals.flatMap(
      (e: { expectations: string[] }) =>
        e.expectations.map((x) => x.split(':')[0]),
    )
    for (const key of [
      // Untrimming a mode has to come from the base, not fresh prose.
      'dod-validator-untrimmed-from-base',
      'implementer-regains-kill-mutants',
      // A change to inputs reaches all four launch paths, not just the YAML.
      'input-threaded-everywhere',
      // The failure the drift fixture exists for.
      'hand-edits-preserved',
      'audit-reported-before-changing',
      // Removal is a sweep, not a deletion.
      'orphans-swept',
      'mode-trimmed-from-implementer',
    ]) {
      expect(names).toContain(key)
    }
    // Every eval carries the two that make an upgrade an upgrade.
    for (const e of evals.evals as {
      name: string
      expectations: string[]
    }[]) {
      const keys = e.expectations.map((x) => x.split(':')[0])
      for (const required of ['nothing-else-touched', 'package-still-valid']) {
        expect({ eval: e.name, has: keys.includes(required) }).toEqual({
          eval: e.name,
          has: true,
        })
      }
    }
  })

  test('the diff extractor reports what an upgrade touched', () => {
    const baseline = path.join(workspace, 'fixtures', 'bun-app-shipped')
    const result = path.join(mkdtempSync(path.join(tmpdir(), 'awc-upg-')), 'r')
    cpSync(baseline, result, { recursive: true })
    const agent = path.join(
      result,
      'workflows',
      'ship-feature',
      'agents',
      'dod_validator.md',
    )
    writeFileSync(agent, `${readFileSync(agent, 'utf8')}\n`)
    writeFileSync(path.join(result, 'workflows', 'ship-feature', 'new.sh'), 'x')

    const script = path.join(workspace, 'scripts', 'check_upgrade.ts')
    const run = Bun.spawnSync(['bun', script, baseline, result])
    expect(run.exitCode).toBe(0)
    const facts = JSON.parse(run.stdout.toString())

    expect(facts.modified).toContain(
      path.join('workflows', 'ship-feature', 'agents', 'dod_validator.md'),
    )
    expect(facts.added).toContain(
      path.join('workflows', 'ship-feature', 'new.sh'),
    )
    expect(facts.removed).toEqual([])
    // `touched` is what a "nothing else was changed" reading works from.
    expect(facts.touched).toHaveLength(2)
    rmSync(path.dirname(result), { recursive: true, force: true })
  })
})

// The editor's evals grade a diff plus the session's conduct: the stated
// changes land ungated, everything beyond them stays gated, validation never
// shrinks. Its fixture is borrowed from the upgrader workspace (one canonical
// shipped package, no second copy to rot), so the relative path and the
// edit-only keys are pinned against silent renames.
describe('the editor eval material', () => {
  const workspace = path.join(
    import.meta.dir,
    '..',
    'workflow-editor-workspace',
  )
  const evals = JSON.parse(
    readFileSync(path.join(workspace, 'evals', 'evals.json'), 'utf8'),
  )

  test('every fixture resolves, and only the bare one lacks a package', () => {
    expect(evals.evals.length).toBeGreaterThan(0)
    for (const e of evals.evals as { name: string; files: string[] }[]) {
      expect(e.files.length).toBeGreaterThan(0)
      for (const f of e.files) {
        const fixture = path.join(workspace, f)
        expect({
          eval: e.name,
          exists: existsSync(fixture),
          hasWorkflows: existsSync(path.join(fixture, 'workflows')),
        }).toEqual({
          eval: e.name,
          exists: true,
          // The hand-to-creator eval is the one session with nothing to edit.
          hasWorkflows: !f.includes('bun-app-bare'),
        })
      }
    }
  })

  test('the keys that grade edit-only behavior are all present', () => {
    const names: string[] = evals.evals.flatMap(
      (e: { expectations: string[] }) =>
        e.expectations.map((x) => x.split(':')[0]),
    )
    for (const key of [
      // The stated changes are the approval: no plan gate on them...
      'stated-changes-no-plan-gate',
      // ...while everything beyond them stays gated...
      'beyond-request-still-gated',
      // ...and the validation never shrinks.
      'validation-still-full',
      // Requests that are not edits go to the session or launcher that owns
      // them — the run hand-off matters most, since --edit previously RAN a
      // package and a "use my workflow to build X" ask is the likeliest
      // misclassification.
      'redirected-to-create',
      'nothing-written',
      'redirected-to-upgrade',
      'run-handed-to-launchers',
      'no-run-improvised',
      // A node-list change is where a missed ripple actually breaks a run —
      // and where an over-eager sweep deletes what surviving nodes share.
      'node-list-orphans-swept',
      'shared-artifacts-survive',
    ]) {
      expect(names).toContain(key)
    }
    // Every package-holding eval carries the two that make a change safe;
    // the bare fixture has no package to keep valid, so it carries
    // nothing-written instead.
    for (const e of evals.evals as {
      name: string
      files: string[]
      expectations: string[]
    }[]) {
      if (e.files.some((f) => f.includes('bun-app-bare'))) continue
      const keys = e.expectations.map((x) => x.split(':')[0])
      for (const required of ['nothing-else-touched', 'package-still-valid']) {
        expect({ eval: e.name, has: keys.includes(required) }).toEqual({
          eval: e.name,
          has: true,
        })
      }
    }
  })
})

// The flag descriptions exist in three hand-synced copies — the --help text
// and the fenced Options blocks in README and SPEC. Nothing else relates
// them, so the one distinctive line per flag is pinned in all three; a
// rewording that reaches only some copies fails here instead of shipping a
// stale doc.
describe('the docs carry the help text', () => {
  const files = ['src/cli.ts', 'README.md', 'SPEC.md']
  test('each flag description names its skill in every copy', () => {
    for (const file of files) {
      const text = readFileSync(path.join(import.meta.dir, '..', file), 'utf8')
      for (const line of [
        'Open the session on workflow-upgrader, to change a workflow',
        'Open the session on workflow-editor, to apply the changes',
      ]) {
        expect({ file, has: text.includes(line) }).toEqual({ file, has: true })
      }
    }
  })
})

// The eval material has to exercise the lean story path too: a capture-only
// package is where the trim, the tokenless node shape and the inline source
// all fail quietly if they regress.
describe('the eval material', () => {
  const workspace = path.join(
    import.meta.dir,
    '..',
    'workflow-creator-workspace',
  )

  test('an eval prompts the capture path, and the fact extractor reads it', () => {
    const evals = JSON.parse(
      readFileSync(path.join(workspace, 'evals', 'evals.json'), 'utf8'),
    )
    const names: string[] = evals.evals.flatMap(
      (e: { expectations: string[] }) =>
        e.expectations.map((x) => x.split(':')[0]),
    )
    for (const key of [
      'capture-story-single-node',
      'capture-story-agent-trimmed',
      'spec-opens-from-the-story',
      // The pairing rule's default path: a prompt that asks for a spec and
      // leaves the story to defaults still has to get one.
      'story-step-precedes-spec',
      // The middle setting: reads the source, then asks only what is open.
      'confirm-story-loop-shape',
      'confirm-story-records-the-source',
    ]) {
      expect(names).toContain(key)
    }
    // A capture story skips only the story interview — the spec half still
    // interviews, so its log contract is still graded.
    const capture = evals.evals.find(
      (e: { name: string }) => e.name === 'ticket-capture-story',
    )
    expect(capture.expectations.map((x: string) => x.split(':')[0])).toContain(
      'interview-loop-has-memory',
    )

    const checker = readFileSync(
      path.join(workspace, 'scripts', 'check_package.ts'),
      'utf8',
    )
    // Longest alternative first, or `capture` swallows `capture-and-confirm`
    // at the hyphen and every confirm node reports as a plain capture.
    expect(checker).toContain('(capture-and-confirm|capture|interview)')
  })

  // The mode decides the node shape, and only a per-node view can show it: a
  // whole-file grep reports `capture` and `until: USER_STORY_WRITTEN` for a
  // package where the capture sits *inside* that loop and can never close it.
  test('the checker reports each story step with its loop context', () => {
    const pkg = path.join(mkdtempSync(path.join(tmpdir(), 'awc-pkg-')), 'pkg')
    const wf = path.join(pkg, 'workflows', 'demo')
    mkdirSync(wf, { recursive: true })
    writeFileSync(
      path.join(wf, 'demo.yaml'),
      [
        'inputs: [task, source]',
        'nodes:',
        '  - id: story',
        '    loop:',
        '      agent: agents/story_partner.md',
        '      prompt: "Task: {{task}}. Mode: capture. Source: {{source}}"',
        '      expect: user_story',
        '      until: USER_STORY_WRITTEN',
        '      max_iterations: 10',
        '  - id: confirm',
        '    agent: agents/story_partner.md',
        '    prompt: "Task: {{task}}. Mode: capture-and-confirm. Source: {{source}}. The human\'s previous answer: {{answer}}"',
        '    expect: user_story',
        '',
      ].join('\n'),
    )

    const script = path.join(workspace, 'scripts', 'check_package.ts')
    const run = Bun.spawnSync(['bun', script, pkg])
    expect(run.exitCode).toBe(0)
    const steps = JSON.parse(run.stdout.toString()).workflows[0].storySteps

    // A tokenless capture wrapped in a token-closed loop: visible as such.
    expect(steps[0].mode).toBe('capture')
    expect(steps[0].in_loop.until).toBe('USER_STORY_WRITTEN')
    expect(steps[0].relays_answer).toBe(false)
    // A confirm turn on a plain node: no loop to relay its question into.
    expect(steps[1].mode).toBe('capture-and-confirm')
    expect(steps[1].in_loop).toBeNull()
    expect(steps[1].source_arg).toBe(true)

    rmSync(path.dirname(pkg), { recursive: true, force: true })
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

// The staged payload and the initial prompt are chosen in different places, so
// a host could stage the upgrader and still greet with the create prompt. Smoke
// cannot see this: it launches with `--version`, which never reads the prompt.
describe('the launch command each host builds', () => {
  const HOST_COMMANDS = [
    {
      host: 'claude',
      build: (o: AgentOptions) => claudeCommand(o, '/staged'),
    },
    { host: 'codex', build: (o: AgentOptions) => codexCommand(o, '/staged') },
    {
      host: 'opencode',
      build: (o: AgentOptions) => opencodeCommand(o, '/staged'),
    },
  ]

  function opts(mode: Mode): AgentOptions {
    return { tmpDir: '/unused', keep: false, mode, passthrough: ['--flag'] }
  }

  for (const { host, build } of HOST_COMMANDS) {
    test(`${host} puts this session's own prompt on argv`, () => {
      const create = build(opts('create'))
      const upgrade = build(opts('upgrade'))
      const edit = build(opts('edit'))

      // Wiring only: each mode's own prompt file lands on argv verbatim.
      // What the prompts say is `readPrompt`'s test below — one place.
      expect(create.args).toContain(readPrompt(hostDir(host)))
      expect(upgrade.args).toContain(readPrompt(hostDir(host), 'upgrade'))
      expect(edit.args).toContain(readPrompt(hostDir(host), 'edit'))
      // Passthrough still rides last, in every mode.
      expect(create.args.at(-1)).toBe('--flag')
      expect(upgrade.args.at(-1)).toBe('--flag')
      expect(edit.args.at(-1)).toBe('--flag')
    })
  }
})

describe('readPrompt', () => {
  test('every host ships a trimmed initial prompt for all three modes', () => {
    for (const host of hostNames()) {
      const create = readPrompt(hostDir(host))
      const upgrade = readPrompt(hostDir(host), 'upgrade')
      const edit = readPrompt(hostDir(host), 'edit')
      for (const prompt of [create, upgrade, edit]) {
        expect(prompt.length).toBeGreaterThan(0)
        expect(prompt).toBe(prompt.trim())
      }
      // The flag has to change what the session opens on, or the flag is
      // staging alone and the model still starts by offering to build one.
      expect(upgrade).not.toBe(create)
      expect(edit).not.toBe(create)
      expect(edit).not.toBe(upgrade)
      expect(upgrade).toContain('workflow-upgrader')
      expect(edit).toContain('workflow-editor')
      // And no prompt may name a change skill its session did not stage:
      // pointing a user at an unloaded skill strands them. Catches a mode's
      // prompt file copied over another's, which the inequalities above
      // would not.
      expect(create).not.toContain('workflow-upgrader')
      expect(create).not.toContain('workflow-editor')
      expect(upgrade).not.toContain('workflow-editor')
      expect(edit).not.toContain('workflow-upgrader')
    }
  })
})
