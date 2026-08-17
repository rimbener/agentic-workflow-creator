import { cpSync } from 'node:fs'
import path from 'node:path'
import { hostDir, sharedDir } from '../paths'
import { copyPayload, readPrompt, resetTmp } from '../staging'
import { type AgentOptions, launch } from './run'

// Claude Code loads a whole plugin from one flag, so staging is a plain copy:
// the host's manifest plus the shared payload under the plugin's own names.
export function stageClaude(tmpDir: string): string {
  const host = hostDir('claude')
  const pluginDir = path.join(tmpDir, 'plugin')

  resetTmp(tmpDir)
  cpSync(path.join(host, 'plugin'), pluginDir, { recursive: true })
  copyPayload(
    sharedDir(),
    path.join(pluginDir, 'skills'),
    path.join(pluginDir, 'commands'),
  )
  return pluginDir
}

export function runClaude(opts: AgentOptions): void {
  const pluginDir = stageClaude(opts.tmpDir)

  launch(opts, {
    bin: 'claude',
    args: [
      '--plugin-dir',
      pluginDir,
      readPrompt(hostDir('claude')),
      ...opts.passthrough,
    ],
    installHint:
      'Install Claude Code first: npm install -g @anthropic-ai/claude-code',
  })
}
