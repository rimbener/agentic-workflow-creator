import { describe, expect, test } from 'bun:test'
import { parseCli } from '../src/args'

describe('parseCli', () => {
  test('defaults', () => {
    const cli = parseCli(['claude'])
    expect(cli.agent).toBe('claude')
    expect(cli.keep).toBe(false)
    expect(cli.tmpDir).toBe('.awc-tmp')
    expect(cli.upgrade).toBe(false)
    expect(cli.edit).toBe(false)
    expect(cli.passthrough).toEqual([])
  })

  test('options', () => {
    const cli = parseCli(['claude', '--keep', '--tmp-dir', '/tmp/x'])
    expect(cli.keep).toBe(true)
    expect(cli.tmpDir).toBe('/tmp/x')
  })

  test('--upgrade selects the upgrade session', () => {
    expect(parseCli(['claude', '--upgrade']).upgrade).toBe(true)
  })

  test('--edit selects the edit session', () => {
    expect(parseCli(['claude', '--edit']).edit).toBe(true)
  })

  // Each flag names the one skill the session opens on; both together name
  // nothing, so the combination is an error rather than a silent priority.
  test('--upgrade with --edit throws', () => {
    expect(() => parseCli(['claude', '--upgrade', '--edit'])).toThrow(
      'cannot be combined',
    )
  })

  test('passthrough after --', () => {
    const cli = parseCli([
      'claude',
      '--keep',
      '--',
      '--version',
      '--keep',
      '--upgrade',
      '--edit',
    ])
    expect(cli.keep).toBe(true)
    expect(cli.upgrade).toBe(false)
    expect(cli.edit).toBe(false)
    expect(cli.passthrough).toEqual([
      '--version',
      '--keep',
      '--upgrade',
      '--edit',
    ])
  })

  test('no agent', () => {
    const cli = parseCli([])
    expect(cli.agent).toBeUndefined()
  })

  test('help and version shorthands', () => {
    expect(parseCli(['-h']).help).toBe(true)
    expect(parseCli(['-v']).version).toBe(true)
  })

  test('unknown option throws', () => {
    expect(() => parseCli(['claude', '--bogus'])).toThrow()
  })
})
