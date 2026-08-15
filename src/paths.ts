import { fileURLToPath } from "node:url";

// Resolved relative to the compiled entry (dist/cli.js) or source (src/),
// both of which sit next to templates/ in the package root. Never cwd-relative,
// so it works via npx, global install, and local runs alike.
export function templatesDir(): string {
  return fileURLToPath(new URL("../templates", import.meta.url));
}

export function packageJsonPath(): string {
  return fileURLToPath(new URL("../package.json", import.meta.url));
}
