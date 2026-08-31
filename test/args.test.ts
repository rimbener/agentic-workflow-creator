import { describe, expect, test } from 'bun:test'
import { parseCli } from '../src/args'

describe('parseCli', () => {
  test('defaults', () => {
    const cli = parseCli(['claude'])
    expect(cli.agent).toBe('claude')
    expect(cli.keep).toBe(false)
    expect(cli.tmpDir).toBe('.awc-tmp')
    expect(cli.upgrade).toBe(false)
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

  test('passthrough after --', () => {
    const cli = parseCli([
      'claude',
      '--keep',
      '--',
      '--version',
      '--keep',
      '--upgrade',
    ])
    expect(cli.keep).toBe(true)
    expect(cli.upgrade).toBe(false)
    expect(cli.passthrough).toEqual(['--version', '--keep', '--upgrade'])
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
