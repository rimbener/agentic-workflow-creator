import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanup, readPrompt, stage } from "../src/staging";
import { templatesDir } from "../src/paths";

const claudeTemplate = path.join(templatesDir(), "claude");

function freshTmp(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), "awc-test-")), ".awc-tmp");
}

describe("stage", () => {
  test("copies the plugin into the temp folder", () => {
    const tmp = freshTmp();
    stage(tmp, claudeTemplate);
    expect(existsSync(path.join(tmp, "plugin", ".claude-plugin", "plugin.json"))).toBe(true);
    expect(existsSync(path.join(tmp, "plugin", "skills", "workflow-creator", "SKILL.md"))).toBe(true);
    expect(existsSync(path.join(tmp, "plugin", "commands", "awc-status.md"))).toBe(true);
    expect(existsSync(path.join(tmp, "plugin", "scripts", "scaffold.sh"))).toBe(true);
    cleanup(tmp);
  });

  test("replaces a stale temp folder from a previous hard kill", () => {
    const tmp = freshTmp();
    mkdirSync(tmp, { recursive: true });
    writeFileSync(path.join(tmp, "stale-file"), "leftover");
    stage(tmp, claudeTemplate);
    expect(existsSync(path.join(tmp, "stale-file"))).toBe(false);
    expect(existsSync(path.join(tmp, "plugin"))).toBe(true);
    cleanup(tmp);
  });
});

describe("cleanup", () => {
  test("removes the temp folder and is idempotent", () => {
    const tmp = freshTmp();
    stage(tmp, claudeTemplate);
    cleanup(tmp);
    expect(existsSync(tmp)).toBe(false);
    cleanup(tmp); // second call must not throw
  });
});

describe("readPrompt", () => {
  test("returns the trimmed initial prompt", () => {
    const prompt = readPrompt(claudeTemplate);
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt).toBe(prompt.trim());
  });
});
