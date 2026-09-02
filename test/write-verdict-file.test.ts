import { afterAll, describe, expect, test } from 'bun:test'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sharedDir } from '../src/paths'

// The verdict-recording script every generated package copies into scripts/.
// The whole point is the file's shape — exactly one bare verdict word, named
// after the review it belongs to — so these run it rather than assert on text.
const script = path.join(
  sharedDir(),
  'skills',
  'workflow-creator',
  'assets',
  'write-verdict-file.sh',
)

const dirs: string[] = []
function scratch(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'awc-verdict-'))
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

function read(cwd: string, rel: string): string {
  return readFileSync(path.join(cwd, ...rel.split('/')), 'utf8')
}

describe('write-verdict-file.sh', () => {
  test('is executable as shipped', () => {
    // A copy into a package inherits this bit, so a package that forgets
    // `chmod +x` is a bug in the copy, not in the template.
    const probe = Bun.spawnSync([script], { cwd: scratch() })
    expect(probe.exitCode).toBe(1) // usage, not "permission denied"
    expect(probe.stderr.toString()).toContain('usage:')
  })

  test('writes exactly one bare verdict word beside the review', () => {
    const repo = scratch()
    const result = run(repo, ['review-spec', 'CHANGES_REQUESTED'])
    expect(result.code).toBe(0)
    expect(result.stdout + result.stderr).toBe('')
    // One line, the verdict, nothing else — the shape a `when:` guard greps.
    expect(read(repo, 'review-spec-verdict.md')).toBe('CHANGES_REQUESTED\n')
  })

  // Per-slice guards glob review-slice-verdict-*.md, so the slice number
  // stays last in the derived name.
  test('keeps a trailing slice number last in the verdict file name', () => {
    const repo = scratch()
    for (const [n, verdict] of [
      ['1', 'APPROVED'],
      ['2', 'CHANGES_REQUESTED'],
    ] as const) {
      expect(run(repo, [`review-slice-${n}`, verdict]).code).toBe(0)
      expect(read(repo, `review-slice-verdict-${n}.md`)).toBe(`${verdict}\n`)
    }
  })

  test('accepts the .md suffix and a directory, landing beside the review', () => {
    const repo = scratch()
    mkdirSync(path.join(repo, '.awc', 'tasks', 'in-progress', 't', 'tmp'), {
      recursive: true,
    })
    writeFileSync(
      path.join(repo, '.awc', 'tasks', 'in-progress', 't', 'tmp', 'review.md'),
      '# review\n',
    )
    const rel = '.awc/tasks/in-progress/t/tmp/review.md'
    expect(run(repo, [rel, 'APPROVED']).code).toBe(0)
    expect(read(repo, '.awc/tasks/in-progress/t/tmp/review-verdict.md')).toBe(
      'APPROVED\n',
    )
  })

  // A delta-review re-records after fixes; the verdict file is a pure
  // function of the current verdict, so the old word must not survive.
  test('overwrites a verdict recorded earlier', () => {
    const repo = scratch()
    expect(run(repo, ['review', 'CHANGES_REQUESTED']).code).toBe(0)
    expect(run(repo, ['review', 'APPROVED']).code).toBe(0)
    expect(read(repo, 'review-verdict.md')).toBe('APPROVED\n')
  })

  // A verdict file carrying anything but the bare word is the bug this
  // script exists to prevent — so prose, casing and other words all fail,
  // and a previously recorded file is left untouched.
  test('accepts nothing but APPROVED or CHANGES_REQUESTED as the verdict', () => {
    const repo = scratch()
    expect(run(repo, ['review', 'CHANGES_REQUESTED']).code).toBe(0)
    for (const bad of [
      'CHANGES_REQUESTED (see notes)',
      'approved',
      'APPROVED\nCHANGES_REQUESTED',
      'PASS',
      '',
    ]) {
      const result = run(repo, ['review', bad])
      expect(result.code).not.toBe(0)
      // The empty verdict fails the argument check, the rest the verdict
      // check — either way nothing is recorded.
      expect(result.stderr).toMatch(/usage:|verdict must be/)
    }
    expect(read(repo, 'review-verdict.md')).toBe('CHANGES_REQUESTED\n')
  })

  // The derived path becomes real directories and a file — nothing may
  // escape the tree the run works in, the way `..` would.
  test('rejects a review file path that escapes the working tree', () => {
    const repo = scratch()
    const cases = [
      ['my review', 'path segments'],
      ['../escape', 'path segments'],
      ['/tmp/escape', 'must be relative'],
    ] as const
    for (const [bad, message] of cases) {
      const result = run(repo, [bad, 'APPROVED'])
      expect(result.code).not.toBe(0)
      expect(result.stderr).toContain(message)
    }
    // Every rejection happened before the write — the directory is untouched.
    expect(readdirSync(repo)).toEqual([])
  })

  test('requires exactly two arguments', () => {
    const repo = scratch()
    expect(run(repo, []).stderr).toContain('usage:')
    expect(run(repo, ['review']).code).not.toBe(0)
    expect(run(repo, ['review', 'APPROVED', 'extra']).code).not.toBe(0)
  })
})
