import { afterAll, describe, expect, test } from 'bun:test'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sharedDir } from '../src/paths'

const template = path.join(
  sharedDir(),
  'skills',
  'workflow-creator',
  'assets',
  'run.sh',
)

const dirs: string[] = []
function scratch(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true })
})

function git(cwd: string, args: string[]) {
  const result = Bun.spawnSync(['git', ...args], {
    cwd,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@test',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@test',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')}\n${result.stderr.toString()}`)
  }
  return result.stdout.toString()
}

describe('assets/run.sh', () => {
  test('is valid bash and declares the FILL slots', () => {
    const syntax = Bun.spawnSync(['bash', '-n', template])
    expect(syntax.exitCode).toBe(0)
    const text = readFileSync(template, 'utf8')
    expect(text).toContain('__WORKTREE_PARENT__')
    expect(text).not.toContain('__NAME__')
    expect(text).not.toContain('__BRANCH_PREFIX__')
    expect(text).not.toContain('__BASE__')
    expect(text).not.toContain('claude claude')
  })

  function writeScript(repo: string) {
    const script = readFileSync(template, 'utf8').replaceAll(
      '__WORKTREE_PARENT__',
      '.worktrees',
    )
    const dest = path.join(repo, 'demo.sh')
    writeFileSync(dest, script)
    chmodSync(dest, 0o755)
    writeFileSync(
      path.join(repo, 'agents-cli.conf'),
      readFileSync(path.join(path.dirname(template), 'agents-cli.conf')),
    )
    return dest
  }

  function runSh(
    dest: string,
    args: string[],
    opts: { cwd?: string; env?: NodeJS.ProcessEnv; stdin?: string } = {},
  ) {
    return Bun.spawnSync(['bash', dest, ...args], {
      cwd: opts.cwd,
      env: opts.env,
      stdin: Buffer.from(opts.stdin ?? ''),
      stdout: 'pipe',
      stderr: 'pipe',
    })
  }

  test('creates a worktree then starts the host inside it; a second run reuses the tree', () => {
    const repo = scratch('awc-runsh-repo-')
    const bin = scratch('awc-runsh-bin-')
    const log = scratch('awc-runsh-log-')
    git(repo, ['init', '-b', 'main'])
    mkdirSync(path.join(repo, 'workflows', 'demo'), { recursive: true })
    writeFileSync(
      path.join(repo, 'workflows', 'demo', 'demo.yaml'),
      'name: demo\n',
    )
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'package'])

    const dest = writeScript(repo)

    writeFileSync(
      path.join(bin, 'claude'),
      `#!/usr/bin/env bash\npwd > "${log}/cwd"\nprintf '%s\\n' "$@" > "${log}/args"\n`,
    )
    chmodSync(path.join(bin, 'claude'), 0o755)

    const run = () =>
      runSh(dest, ['my-feat', 'claude', 'do the thing'], {
        cwd: repo,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      })

    const first = run()
    expect(first.exitCode).toBe(0)
    const worktree = path.join(repo, '.worktrees', 'my-feat')
    expect(readFileSync(path.join(log, 'cwd'), 'utf8').trim()).toBe(worktree)
    expect(readFileSync(path.join(log, 'args'), 'utf8')).toContain(
      'Task: my-feat',
    )
    expect(readFileSync(path.join(log, 'args'), 'utf8')).toContain(
      'do the thing',
    )
    expect(git(repo, ['worktree', 'list'])).toContain(worktree)
    expect(git(repo, ['branch', '--list', 'task/my-feat']).trim()).toContain(
      'task/my-feat',
    )

    const second = run()
    expect(second.exitCode).toBe(0)
    expect(readFileSync(path.join(log, 'cwd'), 'utf8').trim()).toBe(worktree)
  })

  test('refuses to create the tree when the package is not on HEAD', () => {
    const repo = scratch('awc-runsh-missing-')
    const bin = scratch('awc-runsh-bin2-')
    git(repo, ['init', '-b', 'main'])
    writeFileSync(path.join(repo, 'README.md'), 'x\n')
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'empty'])

    const dest = writeScript(repo)
    writeFileSync(path.join(bin, 'claude'), '#!/usr/bin/env bash\nexit 0\n')
    chmodSync(path.join(bin, 'claude'), 0o755)

    const result = runSh(dest, ['my-feat', 'claude', 'x'], {
      cwd: repo,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr.toString()).toContain('Commit the package')
  })

  test('zero-commit repo still gets the commit-the-package message', () => {
    const repo = scratch('awc-runsh-unborn-')
    const bin = scratch('awc-runsh-bin-unborn-')
    git(repo, ['init', '-b', 'main'])
    const dest = writeScript(repo)
    writeFileSync(path.join(bin, 'claude'), '#!/usr/bin/env bash\nexit 0\n')
    chmodSync(path.join(bin, 'claude'), 0o755)
    const result = runSh(dest, ['my-feat', 'claude', 'x'], {
      cwd: repo,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('Commit the package')
    expect(result.stderr.toString()).not.toContain('Not a valid object name')
  })

  test('cuts the worktree from the current branch, not main', () => {
    const repo = scratch('awc-runsh-head-')
    const bin = scratch('awc-runsh-bin3-')
    git(repo, ['init', '-b', 'main'])
    mkdirSync(path.join(repo, 'workflows', 'demo'), { recursive: true })
    writeFileSync(
      path.join(repo, 'workflows', 'demo', 'demo.yaml'),
      'name: demo\n',
    )
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'package'])
    const mainSha = git(repo, ['rev-parse', 'HEAD']).trim()
    git(repo, ['checkout', '-b', 'other'])
    writeFileSync(path.join(repo, 'marker'), 'on-other\n')
    git(repo, ['add', 'marker'])
    git(repo, ['commit', '-m', 'other'])
    const otherSha = git(repo, ['rev-parse', 'HEAD']).trim()
    expect(otherSha).not.toBe(mainSha)

    const dest = writeScript(repo)
    writeFileSync(path.join(bin, 'claude'), '#!/usr/bin/env bash\nexit 0\n')
    chmodSync(path.join(bin, 'claude'), 0o755)

    const result = runSh(dest, ['my-feat', 'claude', 'x'], {
      cwd: repo,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })
    expect(result.exitCode).toBe(0)
    const worktree = path.join(repo, '.worktrees', 'my-feat')
    expect(git(worktree, ['rev-parse', 'HEAD']).trim()).toBe(otherSha)
    expect(git(worktree, ['rev-parse', 'HEAD']).trim()).not.toBe(mainSha)
  })

  test('resumes when the repo is reached through a symlink', () => {
    const real = scratch('awc-runsh-real-')
    const links = scratch('awc-runsh-links-')
    const linked = path.join(links, 'repo')
    git(real, ['init', '-b', 'main'])
    mkdirSync(path.join(real, 'workflows', 'demo'), { recursive: true })
    writeFileSync(
      path.join(real, 'workflows', 'demo', 'demo.yaml'),
      'name: demo\n',
    )
    git(real, ['add', '.'])
    git(real, ['commit', '-m', 'package'])
    writeScript(real)
    symlinkSync(real, linked)

    const bin = scratch('awc-runsh-bin-link-')
    writeFileSync(path.join(bin, 'claude'), '#!/usr/bin/env bash\nexit 0\n')
    chmodSync(path.join(bin, 'claude'), 0o755)
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` }

    const runFrom = (cwd: string) =>
      runSh(path.join(cwd, 'demo.sh'), ['my-feat', 'claude', 'x'], {
        cwd,
        env,
      })

    const first = runFrom(real)
    expect(first.exitCode).toBe(0)
    const second = runFrom(linked)
    expect(second.exitCode).toBe(0)
    expect(second.stderr.toString()).not.toContain('not a linked worktree')
  })

  test('errors clearly when the branch is already checked out elsewhere', () => {
    const repo = scratch('awc-runsh-busy-')
    git(repo, ['init', '-b', 'main'])
    mkdirSync(path.join(repo, 'workflows', 'demo'), { recursive: true })
    writeFileSync(
      path.join(repo, 'workflows', 'demo', 'demo.yaml'),
      'name: demo\n',
    )
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'package'])
    git(repo, ['checkout', '-b', 'task/my-feat'])
    const dest = writeScript(repo)
    const bin = scratch('awc-runsh-bin-busy-')
    writeFileSync(path.join(bin, 'claude'), '#!/usr/bin/env bash\nexit 0\n')
    chmodSync(path.join(bin, 'claude'), 0o755)

    const result = runSh(dest, ['my-feat', 'claude', 'x'], {
      cwd: repo,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain(
      'branch task/my-feat is already checked out at',
    )
  })

  test('rejects a task id that is not kebab-case', () => {
    const repo = scratch('awc-runsh-kebab-')
    const dest = writeScript(repo)
    for (const task of ['foo/bar', 'Foo', 'foo_bar', '..', '.']) {
      const result = runSh(dest, [task, 'claude', 'x'], { cwd: repo })
      expect(result.exitCode).toBe(2)
      expect(result.stderr.toString()).toContain('kebab-case')
    }
  })

  test('refuses to start without a sibling agents-cli.conf', () => {
    const repo = scratch('awc-runsh-noconf-')
    const dest = path.join(repo, 'demo.sh')
    writeFileSync(
      dest,
      readFileSync(template, 'utf8').replaceAll(
        '__WORKTREE_PARENT__',
        '.worktrees',
      ),
    )
    chmodSync(dest, 0o755)
    const result = runSh(dest, ['my-feat', 'claude', 'x'], { cwd: repo })
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('agents-cli.conf not found')
  })

  test('does not treat a plain directory as a linked worktree', () => {
    const repo = scratch('awc-runsh-plain-')
    const bin = scratch('awc-runsh-bin-plain-')
    const log = scratch('awc-runsh-log-plain-')
    git(repo, ['init', '-b', 'main'])
    mkdirSync(path.join(repo, 'workflows', 'demo'), { recursive: true })
    writeFileSync(
      path.join(repo, 'workflows', 'demo', 'demo.yaml'),
      'name: demo\n',
    )
    mkdirSync(path.join(repo, '.worktrees', 'my-feat'), { recursive: true })
    writeFileSync(
      path.join(repo, '.worktrees', 'my-feat', 'stow.txt'),
      'nope\n',
    )
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'package'])
    const dest = writeScript(repo)
    writeFileSync(
      path.join(bin, 'claude'),
      `#!/usr/bin/env bash\npwd > "${log}/cwd"\n`,
    )
    chmodSync(path.join(bin, 'claude'), 0o755)
    const result = runSh(dest, ['my-feat', 'claude', 'x'], {
      cwd: repo,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('not a linked worktree')
    expect(existsSync(path.join(log, 'cwd'))).toBe(false)
  })

  test('rejects a dangling symlink at the worktree path', () => {
    const repo = scratch('awc-runsh-dangle-')
    git(repo, ['init', '-b', 'main'])
    mkdirSync(path.join(repo, 'workflows', 'demo'), { recursive: true })
    writeFileSync(
      path.join(repo, 'workflows', 'demo', 'demo.yaml'),
      'name: demo\n',
    )
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'package'])
    mkdirSync(path.join(repo, '.worktrees'), { recursive: true })
    symlinkSync('/no/such/worktree', path.join(repo, '.worktrees', 'my-feat'))
    const dest = writeScript(repo)
    const bin = scratch('awc-runsh-bin-dangle-')
    writeFileSync(path.join(bin, 'claude'), '#!/usr/bin/env bash\nexit 0\n')
    chmodSync(path.join(bin, 'claude'), 0o755)
    const result = runSh(dest, ['my-feat', 'claude', 'x'], {
      cwd: repo,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('not a linked worktree')
  })

  test('rejects an agents-cli.conf row with the wrong number of fields', () => {
    const repo = scratch('awc-runsh-badconf-')
    const dest = writeScript(repo)
    writeFileSync(
      path.join(repo, 'agents-cli.conf'),
      'claude\tLaunch Claude Code with the bundled workflow plugin\tplugin\tskills/x\tcommands/x\n',
    )
    const result = runSh(dest, ['my-feat', 'claude', 'x'], { cwd: repo })
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain(
      'expected 6 tab-separated fields',
    )
    expect(result.stderr.toString()).not.toContain('not on PATH: Launch')
  })

  test('rejects duplicate host names in agents-cli.conf', () => {
    const repo = scratch('awc-runsh-dup-')
    const dest = writeScript(repo)
    const row = 'claude\tclaude\thelp\tplugin\tskills/x\tcommands/x\n'
    writeFileSync(path.join(repo, 'agents-cli.conf'), row + row)
    const result = runSh(dest, ['my-feat', 'claude', 'x'], { cwd: repo })
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('duplicate host claude')
  })

  test('uses workflow name and branch prefix from the environment', () => {
    const repo = scratch('awc-runsh-ask-')
    const bin = scratch('awc-runsh-bin-ask-')
    const log = scratch('awc-runsh-log-ask-')
    git(repo, ['init', '-b', 'main'])
    mkdirSync(path.join(repo, 'workflows', 'other'), { recursive: true })
    writeFileSync(
      path.join(repo, 'workflows', 'other', 'other.yaml'),
      'name: other\n',
    )
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'package'])
    const dest = writeScript(repo)
    writeFileSync(
      path.join(bin, 'claude'),
      `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${log}/args"\n`,
    )
    chmodSync(path.join(bin, 'claude'), 0o755)
    const result = runSh(dest, ['my-feat', 'claude', 'x'], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        AWC_NAME: 'other',
        AWC_BRANCH_PREFIX: 'feat',
      },
    })
    expect(result.exitCode).toBe(0)
    expect(git(repo, ['branch', '--list', 'feat/my-feat']).trim()).toContain(
      'feat/my-feat',
    )
    expect(readFileSync(path.join(log, 'args'), 'utf8')).toContain(
      'workflows/other/other.yaml',
    )
  })

  test('rejects a workflow name that is not kebab-case', () => {
    const repo = scratch('awc-runsh-name-')
    const bin = scratch('awc-runsh-bin-name-')
    const dest = writeScript(repo)
    writeFileSync(path.join(bin, 'claude'), '#!/usr/bin/env bash\nexit 0\n')
    chmodSync(path.join(bin, 'claude'), 0o755)
    const result = runSh(dest, ['my-feat', 'claude', 'x'], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        AWC_NAME: 'NotGood',
      },
    })
    expect(result.exitCode).toBe(2)
    expect(result.stderr.toString()).toContain('workflow name must be')
  })

  test('leaves stdin for the host', () => {
    const repo = scratch('awc-runsh-stdin-')
    const bin = scratch('awc-runsh-bin-stdin-')
    const log = scratch('awc-runsh-log-stdin-')
    git(repo, ['init', '-b', 'main'])
    mkdirSync(path.join(repo, 'workflows', 'demo'), { recursive: true })
    writeFileSync(
      path.join(repo, 'workflows', 'demo', 'demo.yaml'),
      'name: demo\n',
    )
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'package'])
    const dest = writeScript(repo)
    writeFileSync(
      path.join(bin, 'claude'),
      `#!/usr/bin/env bash\ncat > "${log}/stdin"\n`,
    )
    chmodSync(path.join(bin, 'claude'), 0o755)
    const result = runSh(dest, ['my-feat', 'claude', 'x'], {
      cwd: repo,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
      stdin: 'keep-me\nstill-here\n',
    })
    expect(result.exitCode).toBe(0)
    expect(readFileSync(path.join(log, 'stdin'), 'utf8')).toBe(
      'keep-me\nstill-here\n',
    )
  })

  test('resume refuses a workflow name that is not in the tree', () => {
    const repo = scratch('awc-runsh-resume-name-')
    const bin = scratch('awc-runsh-bin-resume-name-')
    const log = scratch('awc-runsh-log-resume-name-')
    git(repo, ['init', '-b', 'main'])
    mkdirSync(path.join(repo, 'workflows', 'demo'), { recursive: true })
    writeFileSync(
      path.join(repo, 'workflows', 'demo', 'demo.yaml'),
      'name: demo\n',
    )
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'package'])
    const dest = writeScript(repo)
    writeFileSync(
      path.join(bin, 'claude'),
      `#!/usr/bin/env bash\npwd > "${log}/cwd"\n`,
    )
    chmodSync(path.join(bin, 'claude'), 0o755)
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` }
    expect(
      runSh(dest, ['my-feat', 'claude', 'x'], { cwd: repo, env }).exitCode,
    ).toBe(0)
    rmSync(path.join(log, 'cwd'))
    const second = runSh(dest, ['my-feat', 'claude', 'x'], {
      cwd: repo,
      env: { ...env, AWC_NAME: 'other' },
    })
    expect(second.exitCode).toBe(1)
    expect(second.stderr.toString()).toContain('no package workflows/other/')
    expect(existsSync(path.join(log, 'cwd'))).toBe(false)
  })

  test('renamed script does not claim the package is uncommitted', () => {
    const repo = scratch('awc-runsh-rename-')
    const bin = scratch('awc-runsh-bin-rename-')
    const dest = writeScript(repo)
    git(repo, ['init', '-b', 'main'])
    mkdirSync(path.join(repo, 'workflows', 'demo'), { recursive: true })
    writeFileSync(
      path.join(repo, 'workflows', 'demo', 'demo.yaml'),
      'name: demo\n',
    )
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'package'])
    writeFileSync(path.join(bin, 'claude'), '#!/usr/bin/env bash\nexit 0\n')
    chmodSync(path.join(bin, 'claude'), 0o755)
    const launch = path.join(repo, 'launch.sh')
    writeFileSync(launch, readFileSync(dest))
    chmodSync(launch, 0o755)
    const result = runSh(launch, ['my-feat', 'claude', 'x'], {
      cwd: repo,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    })
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('workflows/launch/launch.yaml')
    expect(result.stderr.toString()).toContain('AWC_NAME=')
    expect(result.stderr.toString()).toContain('known: demo')
    expect(result.stderr.toString()).not.toContain('Commit the package')
    expect(result.stderr.toString()).not.toContain('defaulted')
  })

  test('wrong AWC_NAME points at the env override, not a default', () => {
    const repo = scratch('awc-runsh-awcname-')
    const bin = scratch('awc-runsh-bin-awcname-')
    git(repo, ['init', '-b', 'main'])
    mkdirSync(path.join(repo, 'workflows', 'demo'), { recursive: true })
    writeFileSync(
      path.join(repo, 'workflows', 'demo', 'demo.yaml'),
      'name: demo\n',
    )
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'package'])
    const dest = writeScript(repo)
    writeFileSync(path.join(bin, 'claude'), '#!/usr/bin/env bash\nexit 0\n')
    chmodSync(path.join(bin, 'claude'), 0o755)
    const result = runSh(dest, ['my-feat', 'claude', 'x'], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        AWC_NAME: 'other',
      },
    })
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('workflows/other/other.yaml')
    expect(result.stderr.toString()).toContain('AWC_NAME=')
    expect(result.stderr.toString()).toContain('known: demo')
    expect(result.stderr.toString()).not.toContain('defaulted')
  })

  test('lists multiple known packages with comma-space', () => {
    const repo = scratch('awc-runsh-known-')
    const bin = scratch('awc-runsh-bin-known-')
    git(repo, ['init', '-b', 'main'])
    for (const name of ['demo', 'other', 'zap']) {
      mkdirSync(path.join(repo, 'workflows', name), { recursive: true })
      writeFileSync(
        path.join(repo, 'workflows', name, `${name}.yaml`),
        `name: ${name}\n`,
      )
    }
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'package'])
    const dest = writeScript(repo)
    writeFileSync(path.join(bin, 'claude'), '#!/usr/bin/env bash\nexit 0\n')
    chmodSync(path.join(bin, 'claude'), 0o755)
    const result = runSh(dest, ['my-feat', 'claude', 'x'], {
      cwd: repo,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        AWC_NAME: 'nope',
      },
    })
    expect(result.exitCode).toBe(1)
    expect(result.stderr.toString()).toContain('known: demo, other, zap')
    expect(result.stderr.toString()).not.toContain('demo,other')
  })
})
