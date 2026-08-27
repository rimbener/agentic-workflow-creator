import { homedir } from 'node:os'
import path from 'node:path'
import { type Mode, skipSkills } from '../mode'
import { hostDir, sharedDir } from '../paths'
import { copyPayload, readPrompt, resetTmp, shadow } from '../staging'
import { type AgentOptions, type Launch, launch } from './run'

function realOpencodeConfig(): string {
  if (process.env.OPENCODE_CONFIG_DIR) return process.env.OPENCODE_CONFIG_DIR
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(homedir(), '.config')
  return path.join(xdg, 'opencode')
}

// OPENCODE_CONFIG_DIR replaces — rather than adds to — where opencode looks for
// skills, commands and agents, so awc shadows the user's real config dir and
// merges the payload into `skill/` and `command/`. Everything else (opencode.json,
// the user's agents, plugins) stays linked and therefore still loads.
export function stageOpencode(tmpDir: string, mode: Mode = 'create'): string {
  const config = path.join(tmpDir, 'opencode-config')

  resetTmp(tmpDir)
  shadow(realOpencodeConfig(), config, ['skill', 'command'])
  copyPayload(
    sharedDir(),
    path.join(config, 'skill'),
    path.join(config, 'command'),
    skipSkills(mode),
  )
  return config
}

export function opencodeCommand(opts: AgentOptions, config: string): Launch {
  return {
    bin: 'opencode',
    args: [
      '--prompt',
      readPrompt(hostDir('opencode'), opts.mode),
      ...opts.passthrough,
    ],
    env: { OPENCODE_CONFIG_DIR: config },
    installHint: 'Install opencode first: npm install -g opencode-ai',
  }
}

export function runOpencode(opts: AgentOptions): void {
  launch(opts, opencodeCommand(opts, stageOpencode(opts.tmpDir, opts.mode)))
}
