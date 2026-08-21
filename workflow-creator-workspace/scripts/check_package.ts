// Objective facts extractor for a generated workflow package.
// Usage: bun check_package.ts <repo-dir> <skill-running-md-path>
// Prints a JSON facts report; it never judges — graders combine these facts
// with their own reading of the files.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { loadHosts, parseHostsConf } from '../../src/hosts'

const repo = process.argv[2]
const runningMdRef = process.argv[3]
if (!repo) {
  console.error('usage: bun check_package.ts <repo-dir> <skill-running-md>')
  process.exit(1)
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === 'node_modules') continue
    const p = path.join(dir, entry)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const files = walk(repo)
const rel = (p: string) => path.relative(repo, p)
const isExec = (p: string) => (statSync(p).mode & 0o111) !== 0
const GIT_WORKTREE = /git\s+worktree/

// Find candidate workflow YAMLs: any yaml with a top-level nodes/steps/jobs list.
const yamlFiles = files.filter((f) => /\.ya?ml$/.test(f))
const workflows: { file: string; doc: any; parseError?: string }[] = []
for (const f of yamlFiles) {
  try {
    const doc = Bun.YAML.parse(readFileSync(f, 'utf8')) as any
    if (doc && typeof doc === 'object' && (doc.nodes || doc.steps || doc.jobs || doc.stages || doc.phases)) {
      workflows.push({ file: rel(f), doc })
    }
  } catch (e: any) {
    workflows.push({ file: rel(f), doc: null, parseError: String(e?.message ?? e) })
  }
}

const BEHAVIOR_KEYS = ['run', 'agent', 'loop', 'gate', 'bash', 'script', 'prompt', 'command', 'cmd', 'shell']

function nodeFacts(node: any, idx: number) {
  if (node === null || typeof node !== 'object') return { idx, malformed: true }
  const keys = Object.keys(node)
  const behaviors = keys.filter((k) => BEHAVIOR_KEYS.includes(k))
  // agent+prompt is one behavior; prompt alone counts as one
  const normalized = new Set(behaviors.map((b) => (b === 'prompt' && behaviors.includes('agent') ? 'agent' : b)))
  const cmdKeys = ['run', 'bash', 'command', 'cmd', 'shell', 'script']
  const multilineCmds: string[] = []
  for (const k of cmdKeys) {
    if (typeof node[k] === 'string' && node[k].trim().includes('\n')) multilineCmds.push(k)
  }
  const facts: any = {
    idx,
    id: node.id ?? node.name ?? null,
    keys,
    behaviorCount: normalized.size,
    multilineCmds,
  }
  if (node.loop && typeof node.loop === 'object') {
    const loop = node.loop
    facts.loop = {
      max_iterations: loop.max_iterations ?? loop.maxIterations ?? null,
      until: loop.until ?? null,
      until_run: loop.until_run ?? loop.untilRun ?? loop.until_bash ?? null,
      stepCount: Array.isArray(loop.steps) ? loop.steps.length : loop.prompt || loop.agent ? 1 : 0,
      steps: Array.isArray(loop.steps) ? loop.steps.map((s: any, i: number) => nodeFacts(s, i)) : undefined,
    }
    for (const k of ['prompt', 'agent', 'expect']) if (loop[k] !== undefined) (facts.loop as any)[k] = loop[k]
  }
  for (const k of ['agent', 'expect', 'when', 'when_bash', 'dir', 'gate', 'prompt']) {
    if (node[k] !== undefined) facts[k] = node[k]
  }
  if (typeof node.run === 'string') facts.run = node.run
  return facts
}

function collectRefs(doc: any): { agents: string[]; scripts: string[] } {
  const agents = new Set<string>()
  const scripts = new Set<string>()
  const visit = (v: any) => {
    if (Array.isArray(v)) return v.forEach(visit)
    if (v && typeof v === 'object') {
      if (typeof v.agent === 'string') agents.add(v.agent)
      for (const k of ['run', 'bash', 'command', 'cmd', 'script', 'until_run', 'until_bash', 'when', 'when_bash']) {
        if (typeof v[k] === 'string') {
          const m = v[k].match(/[\w./-]+\.(?:sh|mjs|ts|js|py)\b/g)
          if (m) m.forEach((s: string) => scripts.add(s))
        }
      }
      return Object.values(v).forEach(visit)
    }
  }
  visit(doc)
  return { agents: [...agents], scripts: [...scripts] }
}

const report: any = { repo, workflows: [] }

for (const wf of workflows) {
  if (!wf.doc) {
    report.workflows.push({ file: wf.file, parseError: wf.parseError })
    continue
  }
  const doc = wf.doc
  const nodes: any[] = Array.isArray(doc.nodes) ? doc.nodes : []
  const wfDir = path.dirname(path.join(repo, wf.file))
  const refs = collectRefs(doc)
  const resolveRef = (r: string) => {
    for (const base of [wfDir, repo]) {
      const p = path.join(base, r)
      if (existsSync(p)) {
        const st = statSync(p)
        return { exists: true, executable: (st.mode & 0o111) !== 0, at: rel(p) }
      }
    }
    return { exists: false, executable: false }
  }
  const raw = readFileSync(path.join(repo, wf.file), 'utf8')
  report.workflows.push({
    file: wf.file,
    topLevelKeys: Object.keys(doc),
    workdir: doc.workdir ?? null,
    inputs: doc.inputs ?? null,
    nodeCount: nodes.length,
    nodes: nodes.map(nodeFacts),
    refs: {
      agents: Object.fromEntries(refs.agents.map((a) => [a, resolveRef(a)])),
      scripts: Object.fromEntries(refs.scripts.map((s) => [s, resolveRef(s)])),
    },
    greps: {
      git_worktree: GIT_WORKTREE.test(raw),
      gherkin: /gherkin/i.test(raw),
      format_plain: /Format:\s*plain/i.test(raw),
      only_failures: /--only-failures/.test(raw),
      silent_or_quiet: /--silent|--quiet|-q\b|--reporter[= ]?dot/.test(raw),
      until_run: /until_run|until_bash/.test(raw),
      base_arg: /Base:\s/.test(raw),
      log_arg: /Log:\s/.test(raw),
      report_arg: /Report:\s/.test(raw),
      commands_arg: /Commands:\s/.test(raw),
      slice_arg: /Slice:\s/.test(raw),
      stryker: /stryker/i.test(raw),
      push_or_pr: /git\s+push|gh\s+pr|pull request creat/i.test(raw),
    },
  })
}

const workflowNames = new Set(
  workflows.map((w) => path.basename(path.dirname(w.file))).filter((n) => n && n !== '.'),
)

const skillRoster = loadHosts()
  .map((h) => h.name)
  .join()

// Package-level facts
const skillRunning = runningMdRef && existsSync(runningMdRef) ? readFileSync(runningMdRef, 'utf8') : null
const runningCandidates = files.filter((f) => /running\.md$/i.test(f))
report.package = {
  // One launcher per supported host; graders check all three are present and agree.
  launchers: {
    claude: files.filter((f) => rel(f).startsWith('.claude/commands/')).map(rel),
    codex: files.filter((f) => rel(f).startsWith('.codex/skills/')).map(rel),
    opencode: files.filter((f) => /^\.opencode\/commands?\//.test(rel(f))).map(rel),
  },
  agentFiles: files.filter((f) => /agents\/[^/]+\.md$/.test(rel(f))).map(rel),
  scriptFiles: files
    .filter((f) => /scripts\/[^/]+\.(sh|mjs|ts|js|py)$/.test(rel(f)))
    .map((f) => ({ file: rel(f), executable: isExec(f), lines: readFileSync(f, 'utf8').split('\n').length })),
  launchScripts: files
    .filter((f) => {
      const r = rel(f)
      return /^[^/]+\.sh$/.test(r) && workflowNames.has(r.slice(0, -3))
    })
    .map((f) => ({
      file: rel(f),
      executable: isExec(f),
      git_worktree: GIT_WORKTREE.test(readFileSync(f, 'utf8')),
    })),
  hostConfig: files
    .filter((f) => rel(f) === 'agents-cli.conf')
    .map((f) => {
      const names = parseHostsConf(readFileSync(f, 'utf8')).map((h) => h.name)
      return {
        file: rel(f),
        names,
        matchesSkillRoster: names.join() === skillRoster,
      }
    }),
  workflowLeadPresent: files.some((f) => /workflow_lead\.md$/.test(f)),
  runningMd: runningCandidates.map((f) => ({
    file: rel(f),
    verbatimCopyOfSkill: skillRunning !== null ? readFileSync(f, 'utf8') === skillRunning : null,
  })),
  allFiles: files.map(rel).sort(),
}

console.log(JSON.stringify(report, null, 2))
