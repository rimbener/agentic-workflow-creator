// Objective facts extractor for an *update* to a workflow package.
// Usage: bun check_update.ts <baseline-dir> <result-dir>
//
// An update is graded on its diff, not on the package alone, and both halves of
// that grading need the same list: which files the session added, removed and
// changed. This prints exactly that, and never judges — a grader combines it
// with `check_package.ts` (is the result still a valid package?) and its own
// reading of the change.
//
// Deliberately not git-based: an eval run may or may not have committed the
// fixture, and comparing two directories is the same answer either way.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

const baseline = process.argv[2]
const result = process.argv[3]
if (!baseline || !result) {
  console.error('usage: bun check_update.ts <baseline-dir> <result-dir>')
  process.exit(1)
}

function walk(dir: string, base = dir, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === 'node_modules') continue
    const p = path.join(dir, entry)
    if (statSync(p).isDirectory()) walk(p, base, out)
    else out.push(path.relative(base, p))
  }
  return out
}

const before = new Set(walk(baseline))
const after = new Set(walk(result))

const added = [...after].filter((f) => !before.has(f)).sort()
const removed = [...before].filter((f) => !after.has(f)).sort()

const modified: string[] = []
const unchanged: string[] = []
for (const f of [...before].filter((x) => after.has(x)).sort()) {
  const a = readFileSync(path.join(baseline, f))
  const b = readFileSync(path.join(result, f))
  ;(a.equals(b) ? unchanged : modified).push(f)
}

// `executable` matters for a script the update added: the package's own
// checklist requires it, and a non-executable one fails only at run time.
const addedExecutable = added.filter((f) => {
  try {
    return (statSync(path.join(result, f)).mode & 0o111) !== 0
  } catch {
    return false
  }
})

console.log(
  JSON.stringify(
    {
      baseline,
      result,
      added,
      removed,
      modified,
      addedExecutable,
      unchangedCount: unchanged.length,
      // The whole point of the "nothing else touched" assertion: every path
      // here should trace to something the user asked for.
      touched: [...added, ...removed, ...modified].sort(),
    },
    null,
    2,
  ),
)
