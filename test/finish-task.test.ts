import { afterAll, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sharedDir } from '../src/paths'

// The trail-archiving script every generated package copies into scripts/.
// Asserting on its text would miss what actually matters — that it moves the
// whole directory, survives a resume, and leaves git alone — so these run it.
const script = path.join(
  sharedDir(),
  'skills',
  'workflow-creator',
  'assets',
  'finish-task.sh',
)

const dirs: string[] = []
function scratch(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'awc-finish-'))
  dirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

function run(cwd: string, args: string[]) {
  const result = Bun.spawnSync(['bash', script, ...args], { cwd })
  return {
    code: result.exitCode,
    stdout: result.stdout.toString(),
    stderr: result.stderr.toString(),
  }
}

// A trail as the agents leave it: the approved pair at the root, everything
// else in tmp/.
function trail(cwd: string, task: string) {
  const dir = path.join(cwd, '.awc', 'tasks', 'in-progress', task)
  mkdirSync(path.join(dir, 'tmp'), { recursive: true })
  writeFileSync(path.join(dir, 'spec.md'), '# spec\n')
  writeFileSync(path.join(dir, 'acceptance-criteria.md'), '# AC-1\n')
  writeFileSync(path.join(dir, 'tmp', 'review.md'), '# review\n')
  return dir
}

function git(cwd: string, args: string[]) {
  return Bun.spawnSync(['git', ...args], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
    },
  })
}

describe('finish-task.sh', () => {
  test('is executable as shipped', () => {
    // A copy into a package inherits this bit, so a package that forgets
    // `chmod +x` is a bug in the copy, not in the template.
    const probe = Bun.spawnSync([script], { cwd: scratch() })
    expect(probe.exitCode).toBe(1) // usage, not "permission denied"
    expect(probe.stderr.toString()).toContain('usage:')
  })

  test('moves the whole task directory, tmp/ included, and says nothing', () => {
    const repo = scratch()
    trail(repo, 'my-task')
    const result = run(repo, ['my-task'])
    expect(result.code).toBe(0)
    expect(result.stdout + result.stderr).toBe('')

    const done = path.join(repo, '.awc', 'tasks', 'done', 'my-task')
    for (const rel of ['spec.md', 'acceptance-criteria.md', 'tmp/review.md']) {
      expect(existsSync(path.join(done, ...rel.split('/')))).toBe(true)
    }
    expect(
      existsSync(path.join(repo, '.awc', 'tasks', 'in-progress', 'my-task')),
    ).toBe(false)
  })

  test('leaves a sibling task in progress alone', () => {
    const repo = scratch()
    trail(repo, 'mine')
    trail(repo, 'theirs')
    expect(run(repo, ['mine']).code).toBe(0)
    expect(
      existsSync(path.join(repo, '.awc', 'tasks', 'in-progress', 'theirs')),
    ).toBe(true)
    expect(existsSync(path.join(repo, '.awc', 'tasks', 'done', 'theirs'))).toBe(
      false,
    )
  })

  // The node re-runs whenever a resume replays the tail of the walk.
  test('is a no-op once the trail is archived', () => {
    const repo = scratch()
    trail(repo, 'my-task')
    expect(run(repo, ['my-task']).code).toBe(0)
    const again = run(repo, ['my-task'])
    expect(again.code).toBe(0)
    expect(again.stderr).toBe('')
    expect(
      existsSync(
        path.join(repo, '.awc', 'tasks', 'done', 'my-task', 'spec.md'),
      ),
    ).toBe(true)
  })

  test('refuses to merge into an existing archive', () => {
    const repo = scratch()
    trail(repo, 'my-task')
    mkdirSync(path.join(repo, '.awc', 'tasks', 'done', 'my-task'), {
      recursive: true,
    })
    const result = run(repo, ['my-task'])
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('already exists')
    // The live trail is untouched, so the human can resolve it by hand.
    expect(
      existsSync(
        path.join(repo, '.awc', 'tasks', 'in-progress', 'my-task', 'spec.md'),
      ),
    ).toBe(true)
  })

  test('halts when there is no trail to archive', () => {
    const result = run(scratch(), ['my-task'])
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain('no trail to archive')
  })

  // The task id names a directory; anything else would move a tree outside
  // the trail entirely.
  test('rejects a task id that is not an id of letters, digits, hyphens, or underscores', () => {
    const repo = scratch()
    for (const bad of ['../foo', 'foo/../../bar', 'my task', 'my.task', '']) {
      const result = run(repo, [bad])
      expect(result.code).not.toBe(0)
    }
    expect(run(repo, [])).toMatchObject({ code: 1 })
  })

  test('accepts a task id in any case', () => {
    for (const task of ['My-Task', 'My_Task']) {
      const repo = scratch()
      trail(repo, task)
      expect(run(repo, [task]).code).toBe(0)
      expect(
        existsSync(path.join(repo, '.awc', 'tasks', 'done', task, 'spec.md')),
      ).toBe(true)
    }
  })

  // Committing the move belongs to the workflow's committer agent. A script
  // that staged anything here would decide that for every package.
  test('leaves git completely alone', () => {
    const repo = scratch()
    git(repo, ['init', '-q', '.'])
    trail(repo, 'my-task')
    git(repo, ['add', '-A'])
    git(repo, ['commit', '-qm', 'trail'])

    expect(run(repo, ['my-task']).code).toBe(0)

    const log = git(repo, ['log', '--oneline']).stdout.toString().trim()
    expect(log.split('\n')).toHaveLength(1)
    // The rename is in the working tree, unstaged, for the committer to take.
    const staged = git(repo, ['diff', '--cached', '--name-only'])
      .stdout.toString()
      .trim()
    expect(staged).toBe('')
    const status = git(repo, ['status', '--porcelain']).stdout.toString()
    expect(status).toContain('.awc/tasks/done/')
  })
})
