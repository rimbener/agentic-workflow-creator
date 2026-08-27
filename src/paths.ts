import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolved relative to the compiled entry (dist/cli.js) or source (src/),
// both of which sit next to templates/ in the package root. Never cwd-relative,
// so it works via npx, global install, and local runs alike.
export function templatesDir(): string {
  return fileURLToPath(new URL('../templates', import.meta.url))
}

// The host-neutral payload: the bundled skills and the awc-status command.
// Each host module places these where it looks for them. Which skills a given
// session gets is src/mode.ts's call — workflow-creator and awc-status ship in
// every session, workflow-updater only under `--update`.
export function sharedDir(): string {
  return path.join(templatesDir(), 'shared')
}

export function agentsCliConfPath(): string {
  return path.join(
    sharedDir(),
    'skills',
    'workflow-creator',
    'assets',
    'agents-cli.conf',
  )
}

// Per-host extras: the initial prompt, plus any manifest the host needs.
export function hostDir(host: string): string {
  return path.join(templatesDir(), 'hosts', host)
}

export function packageJsonPath(): string {
  return fileURLToPath(new URL('../package.json', import.meta.url))
}
