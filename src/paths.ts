import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Resolved relative to the compiled entry (dist/cli.js) or source (src/),
// both of which sit next to templates/ in the package root. Never cwd-relative,
// so it works via npx, global install, and local runs alike.
export function templatesDir(): string {
  return fileURLToPath(new URL('../templates', import.meta.url))
}

// The host-neutral payload every agent gets: the workflow-creator skill and
// the awc-status command. Each host module places these where it looks for them.
export function sharedDir(): string {
  return path.join(templatesDir(), 'shared')
}

export function hostsConfPath(): string {
  return path.join(
    sharedDir(),
    'skills',
    'workflow-creator',
    'assets',
    'hosts.conf',
  )
}

// Per-host extras: the initial prompt, plus any manifest the host needs.
export function hostDir(host: string): string {
  return path.join(templatesDir(), 'hosts', host)
}

export function packageJsonPath(): string {
  return fileURLToPath(new URL('../package.json', import.meta.url))
}
