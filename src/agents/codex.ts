import { homedir } from 'node:os'
import path from 'node:path'
import { type Mode, skipSkills } from '../mode'
import { hostDir, sharedDir } from '../paths'
import {
  copyCommandsAsSkills,
  copySkills,
  readPrompt,
  resetTmp,
  shadow,
} from '../staging'
import { type AgentOptions, type Launch, launch } from './run'

function realCodexHome(): string {
  return process.env.CODEX_HOME ?? path.join(homedir(), '.codex')
}

// Codex has no session-only plugin flag; it reads everything from CODEX_HOME.
// So awc points it at a shadow of the user's real home — links for auth,
// config, sessions and history, and a real `skills/` folder so the payload
// sits beside the user's own without being written into ~/.codex.
//
// Skills are the only slot: Codex dropped `$CODEX_HOME/prompts` in 0.117.0, so
// the bundled command ships as a skill too (see `copyCommandsAsSkills`).
export function stageCodex(tmpDir: string, mode: Mode = 'create'): string {
  const home = path.join(tmpDir, 'codex-home')
  const skills = path.join(home, 'skills')

  resetTmp(tmpDir)
  shadow(realCodexHome(), home, ['skills'])
  copySkills(sharedDir(), skills, skipSkills(mode))
  copyCommandsAsSkills(sharedDir(), skills)
  return home
}

export function codexCommand(opts: AgentOptions, home: string): Launch {
  return {
    bin: 'codex',
    args: [readPrompt(hostDir('codex'), opts.mode), ...opts.passthrough],
    env: { CODEX_HOME: home },
    installHint: 'Install Codex first: npm install -g @openai/codex',
  }
}

export function runCodex(opts: AgentOptions): void {
  launch(opts, codexCommand(opts, stageCodex(opts.tmpDir, opts.mode)))
}
