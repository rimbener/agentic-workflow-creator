import { spawn } from 'node:child_process'
import { cleanup } from '../staging'

export interface AgentOptions {
  tmpDir: string
  keep: boolean
  passthrough: string[]
}

export interface Launch {
  bin: string
  args: string[]
  env?: NodeJS.ProcessEnv
  installHint: string
}

// The stage → spawn → cleanup lifecycle every agent shares. Callers stage first,
// then hand over the command to run.
export function launch(opts: AgentOptions, cmd: Launch): void {
  process.on('exit', () => {
    if (!opts.keep) cleanup(opts.tmpDir)
  })
  // Ctrl+C reaches the whole foreground process group; the agent TUIs use it
  // internally (interrupt turn / exit), so the wrapper must survive it and
  // only clean up once the child actually exits.
  process.on('SIGINT', () => {})
  process.on('SIGTERM', () => process.exit(143))

  const child = spawn(cmd.bin, cmd.args, {
    stdio: 'inherit',
    env: { ...process.env, ...cmd.env },
  })

  child.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') {
      console.error(`awc: \`${cmd.bin}\` was not found on your PATH.`)
      console.error(cmd.installHint)
    } else {
      console.error(`awc: failed to launch ${cmd.bin}: ${err.message}`)
    }
    process.exit(1)
  })

  child.on('close', (code) => process.exit(code ?? 0))
}
