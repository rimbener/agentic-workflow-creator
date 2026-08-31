import { describe, expect, test } from 'bun:test'
import { parseCli } from '../src/args'
import { mode, promptFile, skipSkills } from '../src/mode'

// The flag→mode seam is pinned here end to end: argv → parseCli → mode() →
// the skip list and prompt file each mode resolves to. The staging tests and
// smoke drive stage*(mode) with mode literals, so a mis-wired call site
// (cli.ts handing the wrong flag to mode()) would slip past them — this file
// is the one place the path runs through the real parser.
describe('flag → mode wiring', () => {
  const modeOf = (argv: string[]) => mode(parseCli(argv))

  test('each flag resolves to its own mode', () => {
    expect(modeOf(['claude'])).toBe('create')
    expect(modeOf(['claude', '--upgrade'])).toBe('upgrade')
    expect(modeOf(['claude', '--edit'])).toBe('edit')
  })

  test('each mode reads its own prompt file', () => {
    expect(promptFile('create')).toBe('prompt.md')
    expect(promptFile('upgrade')).toBe('prompt-upgrade.md')
    expect(promptFile('edit')).toBe('prompt-edit.md')
  })

  // A create session stages the creator alone; each change mode stages its
  // own skill and leaves the other's out — the upgrader and the editor are
  // deliberately separate, so neither may ride along with the other.
  test('each mode skips the change skills it does not open on', () => {
    expect(skipSkills('create')).toEqual([
      'workflow-upgrader',
      'workflow-editor',
    ])
    expect(skipSkills('upgrade')).toEqual(['workflow-editor'])
    expect(skipSkills('edit')).toEqual(['workflow-upgrader'])
  })
})
