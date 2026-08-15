import { cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

// Removes any stale folder first: a previous `kill -9` skips cleanup handlers,
// so every run self-heals before staging.
export function stage(tmpDir: string, templateDir: string): void {
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  cpSync(path.join(templateDir, "plugin"), path.join(tmpDir, "plugin"), {
    recursive: true,
  });
}

export function cleanup(tmpDir: string): void {
  rmSync(tmpDir, { recursive: true, force: true });
}

export function readPrompt(templateDir: string): string {
  return readFileSync(path.join(templateDir, "prompt.md"), "utf8").trim();
}
