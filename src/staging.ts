import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs'
import path from 'node:path'
import { type Mode, promptFile } from './mode'

// Removes any stale folder first: a previous `kill -9` skips cleanup handlers,
// so every run self-heals before staging.
export function resetTmp(tmpDir: string): void {
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })
}

export function cleanup(tmpDir: string): void {
  rmSync(tmpDir, { recursive: true, force: true })
}

export function readPrompt(hostDir: string, mode: Mode = 'create'): string {
  return readFileSync(path.join(hostDir, promptFile(mode)), 'utf8').trim()
}

// `skip` leaves out skill directories this session does not open in — see
// src/mode.ts for which, and why the creator is never one of them.
export function copySkills(
  sharedDir: string,
  dest: string,
  skip: string[] = [],
): void {
  copyEntries(path.join(sharedDir, 'skills'), dest, skip)
}

export function copyCommands(sharedDir: string, dest: string): void {
  copyEntries(path.join(sharedDir, 'commands'), dest)
}

// The shared payload for a host with a real slash-command slot.
export function copyPayload(
  sharedDir: string,
  skillsDest: string,
  commandsDest: string,
  skipSkills: string[] = [],
): void {
  copySkills(sharedDir, skillsDest, skipSkills)
  copyCommands(sharedDir, commandsDest)
}

// Ships the bundled commands as skills instead: `commands/<name>.md` becomes
// `<dest>/<name>/SKILL.md`. Codex dropped `$CODEX_HOME/prompts` in 0.117.0 and
// offers no other slash-command slot, so a command staged as a flat file there
// is simply never read. Codex takes a skill's name from its directory, so the
// file's own frontmatter carries over untouched.
export function copyCommandsAsSkills(sharedDir: string, dest: string): void {
  const src = path.join(sharedDir, 'commands')
  mkdirSync(dest, { recursive: true })
  for (const entry of entriesOf(src)) {
    const skillDir = path.join(dest, path.basename(entry, '.md'))
    rmSync(skillDir, { recursive: true, force: true })
    mkdirSync(skillDir, { recursive: true })
    cpSync(path.join(src, entry), path.join(skillDir, 'SKILL.md'))
  }
}

// Copies each entry of `src` into `dest`, unlinking any name already taken.
// That unlink is load-bearing: `dest` is a merge dir from `shadow`, so a
// colliding name is a symlink into the user's real config — and `cpSync`
// follows a symlinked destination, which would write the payload straight
// through into the user's own skill or command. Dropping the link first keeps
// the copy a real file inside the temp dir and leaves the original untouched
// (`rmSync` unlinks a symlink rather than following it).
function copyEntries(src: string, dest: string, skip: string[] = []): void {
  mkdirSync(dest, { recursive: true })
  for (const entry of entriesOf(src)) {
    if (skip.includes(entry)) continue
    const target = path.join(dest, entry)
    rmSync(target, { recursive: true, force: true })
    cpSync(path.join(src, entry), target, { recursive: true })
  }
}

function entriesOf(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return [] // a host the user has never configured has no real dir yet
  }
}

// Mirrors `realDir` into `destDir` as symlinks, so an agent pointed at
// `destDir` keeps the user's own credentials, config and history. Each name in
// `mergeDirs` becomes a real folder holding links to the user's entries, leaving
// room for awc to drop its payload alongside them — that is the whole trick for
// hosts configured by an env var rather than a plugin flag.
//
// Nothing is ever written into `realDir` by staging: the agent writing through
// a link (a new session file, a refreshed token) lands in the user's real
// folder as it should, while deleting `destDir` removes only the links.
export function shadow(
  realDir: string,
  destDir: string,
  mergeDirs: string[],
): void {
  mkdirSync(destDir, { recursive: true })
  const merged = new Set(mergeDirs)

  for (const entry of entriesOf(realDir)) {
    if (merged.has(entry)) continue
    symlinkSync(path.join(realDir, entry), path.join(destDir, entry))
  }

  for (const dir of mergeDirs) {
    const dest = path.join(destDir, dir)
    mkdirSync(dest, { recursive: true })
    for (const entry of entriesOf(path.join(realDir, dir))) {
      symlinkSync(path.join(realDir, dir, entry), path.join(dest, entry))
    }
  }
}
