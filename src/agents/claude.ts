import { spawn } from 'node:child_process'
import path from 'node:path'
import { templatesDir } from '../paths'
import { cleanup, readPrompt, stage } from '../staging'

export interface ClaudeOptions {
  tmpDir: string
  keep: boolean
  passthrough: string[]
}

export function runClaude(opts: ClaudeOptions): void {
  const templateDir = path.join(templatesDir(), 'claude')
  stage(opts.tmpDir, templateDir)

  process.on('exit', () => {
    if (!opts.keep) cleanup(opts.tmpDir)
  })
  // Ctrl+C reaches the whole foreground process group; Claude Code uses it
  // internally (interrupt turn / exit), so the wrapper must survive it and
  // only clean up once the child actually exits.
  process.on('SIGINT', () => {})
  process.on('SIGTERM', () => process.exit(143))

  const args = [
    '--plugin-dir',
    path.join(opts.tmpDir, 'plugin'),
    readPrompt(templateDir),
    ...opts.passthrough,
  ]

  const child = spawn('claude', args, { stdio: 'inherit' })

  child.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') {
      console.error('awc: `claude` was not found on your PATH.')
      console.error(
        'Install Claude Code first: npm install -g @anthropic-ai/claude-code',
      )
    } else {
      console.error(`awc: failed to launch claude: ${err.message}`)
    }
    process.exit(1)
  })

  child.on('close', (code) => process.exit(code ?? 0))
}
