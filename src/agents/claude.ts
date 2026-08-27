import { cpSync } from 'node:fs'
import path from 'node:path'
import { type Mode, skipSkills } from '../mode'
import { hostDir, sharedDir } from '../paths'
import { copyPayload, readPrompt, resetTmp } from '../staging'
import { type AgentOptions, type Launch, launch } from './run'

// Claude Code loads a whole plugin from one flag, so staging is a plain copy:
// the host's manifest plus the shared payload under the plugin's own names.
export function stageClaude(tmpDir: string, mode: Mode = 'create'): string {
  const host = hostDir('claude')
  const pluginDir = path.join(tmpDir, 'plugin')

  resetTmp(tmpDir)
  cpSync(path.join(host, 'plugin'), pluginDir, { recursive: true })
  copyPayload(
    sharedDir(),
    path.join(pluginDir, 'skills'),
    path.join(pluginDir, 'commands'),
    skipSkills(mode),
  )
  return pluginDir
}

// Split out from `runClaude` so a test can read the argv — the session's mode
// picks the initial prompt, and a host that staged the right payload while
// greeting with the wrong prompt would pass every other check.
export function claudeCommand(opts: AgentOptions, pluginDir: string): Launch {
  return {
    bin: 'claude',
    args: [
      '--plugin-dir',
      pluginDir,
      readPrompt(hostDir('claude'), opts.mode),
      ...opts.passthrough,
    ],
    installHint:
      'Install Claude Code first: npm install -g @anthropic-ai/claude-code',
  }
}

export function runClaude(opts: AgentOptions): void {
  launch(opts, claudeCommand(opts, stageClaude(opts.tmpDir, opts.mode)))
}
