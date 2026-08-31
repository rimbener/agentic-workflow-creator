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
// Which story_partner mode a node invokes, if any — the mode decides the node
// shape that can judge it (a token-closed loop, or a plain single-run node).
// Longest alternative first: `capture` would otherwise match the `capture` in
// `capture-and-confirm`, since \b fires at the hyphen.
const STORY_MODE = /Mode:\s*(capture-and-confirm|capture|interview)\b/g
const STORY_MODE_ONE = new RegExp(STORY_MODE.source)

// Find candidate workflow YAMLs: any yaml with a top-level nodes/steps/jobs list.
const yamlFiles = files.filter((f) => /\.ya?ml$/.test(f))
const workflows: {
  file: string
  doc: Record<string, unknown> | null
  parseError?: string
}[] = []
for (const f of yamlFiles) {
  try {
    const doc = Bun.YAML.parse(readFileSync(f, 'utf8')) as Record<
      string,
      unknown
    > | null
    if (
      doc &&
      typeof doc === 'object' &&
      (doc.nodes || doc.steps || doc.jobs || doc.stages || doc.phases)
    ) {
      workflows.push({ file: rel(f), doc })
    }
  } catch (e: unknown) {
    workflows.push({
      file: rel(f),
      doc: null,
      parseError: String(e?.message ?? e),
    })
  }
}

const BEHAVIOR_KEYS = [
  'run',
  'agent',
  'loop',
  'gate',
  'wait',
  'bash',
  'script',
  'prompt',
  'command',
  'cmd',
  'shell',
]

function nodeFacts(node: Record<string, unknown> | null, idx: number) {
  if (node === null || typeof node !== 'object') return { idx, malformed: true }
  const keys = Object.keys(node)
  const behaviors = keys.filter((k) => BEHAVIOR_KEYS.includes(k))
  // agent+prompt is one behavior; prompt alone counts as one
  const normalized = new Set(
    behaviors.map((b) =>
      b === 'prompt' && behaviors.includes('agent') ? 'agent' : b,
    ),
  )
  const cmdKeys = ['run', 'bash', 'command', 'cmd', 'shell', 'script']
  const multilineCmds: string[] = []
  for (const k of cmdKeys) {
    if (typeof node[k] === 'string' && node[k].trim().includes('\n'))
      multilineCmds.push(k)
  }
  const facts: Record<string, unknown> = {
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
      stepCount: Array.isArray(loop.steps)
        ? loop.steps.length
        : loop.prompt || loop.agent
          ? 1
          : 0,
      steps: Array.isArray(loop.steps)
        ? loop.steps.map((s: StoryNode, i: number) =>
            nodeFacts(s as Record<string, unknown>, i),
          )
        : undefined,
    }
    for (const k of ['prompt', 'agent', 'expect', 'allowed_tools'])
      if (loop[k] !== undefined)
        (facts.loop as Record<string, unknown>)[k] = loop[k]
  }
  for (const k of [
    'agent',
    'expect',
    'when',
    'when_bash',
    'dir',
    'gate',
    'prompt',
    'wait',
    'allowed_tools',
  ]) {
    if (node[k] !== undefined) facts[k] = node[k]
  }
  if (typeof node.run === 'string') facts.run = node.run
  if (node.parallel !== undefined) facts.parallel = node.parallel
  return facts
}

// Every story step in the tree, with the loop context that decides whether the
// node shape can judge it: an interviewing mode needs a loop closing on its
// token and the relayed answer in its prompt; a `capture` returns no token, so
// a loop around it can only run to its cap. Reported per node, not as a
// whole-file grep, since the grep cannot tell a looped capture from a plain one.
type StoryNode = Record<string, unknown>

function loopFacts(loop: StoryNode) {
  return {
    until: loop.until ?? null,
    until_run: loop.until_run ?? loop.untilRun ?? loop.until_bash ?? null,
    max_iterations: loop.max_iterations ?? loop.maxIterations ?? null,
  }
}

function storySteps(nodes: StoryNode[]) {
  const found: Record<string, unknown>[] = []
  const visit = (node: StoryNode, loop: StoryNode | null, at: string): void => {
    if (!node || typeof node !== 'object') return
    const prompt = typeof node.prompt === 'string' ? node.prompt : ''
    const mode = prompt.match(STORY_MODE_ONE)?.[1]
    if (mode) {
      found.push({
        at,
        mode,
        agent: node.agent ?? null,
        expect: node.expect ?? null,
        source_arg: /Source:\s*\S/.test(prompt),
        request_arg: /Request:\s*\S/.test(prompt),
        relays_answer: /\{\{\s*answer\s*\}\}/.test(prompt),
        in_loop: loop ? loopFacts(loop) : null,
      })
    }
    const loopKey = node.loop
    if (loopKey && typeof loopKey === 'object') {
      const l = loopKey as StoryNode
      if (Array.isArray(l.steps)) {
        let i = 0
        for (const step of l.steps) {
          visit(step as StoryNode, l, `${at}.loop.steps[${i}]`)
          i += 1
        }
      } else {
        visit(l, l, `${at}.loop`)
      }
    }
  }
  let i = 0
  for (const node of nodes) {
    visit(node, null, `nodes[${i}]${node?.id ? `#${node.id}` : ''}`)
    i += 1
  }
  return found
}

// A flat trail path: `.awc/tasks/` continuing into a segment that is neither
// tier. A closing delimiter right after `tasks/` is prose naming the root.
const TRAIL_FLAT =
  /\.awc\/tasks\/(?!in-progress[/\s`"']|done[/\s`"'])[\w<>{}.-]+/g

function collectRefs(doc: Record<string, unknown>): {
  agents: string[]
  scripts: string[]
} {
  const agents = new Set<string>()
  const scripts = new Set<string>()
  const visit = (v: unknown) => {
    if (Array.isArray(v)) {
      v.forEach(visit)
      return
    }
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>
      if (typeof obj.agent === 'string') agents.add(obj.agent)
      for (const k of [
        'run',
        'bash',
        'command',
        'cmd',
        'script',
        'until_run',
        'until_bash',
        'when',
        'when_bash',
      ]) {
        if (typeof obj[k] === 'string') {
          const m = (obj[k] as string).match(/[\w./-]+\.(?:sh|mjs|ts|js|py)\b/g)
          if (m)
            m.forEach((s: string) => {
              scripts.add(s)
            })
        }
      }
      Object.values(obj).forEach(visit)
    }
  }
  visit(doc)
  return { agents: [...agents], scripts: [...scripts] }
}

const report: Record<string, unknown> = { repo, workflows: [] }

for (const wf of workflows) {
  if (!wf.doc) {
    report.workflows.push({ file: wf.file, parseError: wf.parseError })
    continue
  }
  const doc = wf.doc
  const nodes: Record<string, unknown>[] = Array.isArray(doc.nodes)
    ? (doc.nodes as Record<string, unknown>[])
    : []
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
    storySteps: storySteps(nodes as StoryNode[]),
    refs: {
      agents: Object.fromEntries(refs.agents.map((a) => [a, resolveRef(a)])),
      scripts: Object.fromEntries(refs.scripts.map((s) => [s, resolveRef(s)])),
      // The path a node actually runs, so it can be compared against where
      // the file sits (package.finishTaskScripts). Prose cannot reach here.
      finishTask: refs.scripts.filter((s) => /finish-task\.sh$/.test(s)),
    },
    greps: {
      git_worktree: GIT_WORKTREE.test(raw),
      gherkin: /gherkin/i.test(raw),
      format_plain: /Format:\s*plain/i.test(raw),
      only_failures: /--only-failures/.test(raw),
      silent_or_quiet: /--silent|--quiet|-q\b|--reporter[= ]?dot/.test(raw),
      until_run: /until_run|until_bash/.test(raw),
      allowed_tools: /allowed_tools/.test(raw),
      base_arg: /Base:\s/.test(raw),
      log_arg: /Log:\s/.test(raw),
      report_arg: /Report:\s/.test(raw),
      commands_arg: /Commands:\s/.test(raw),
      slice_arg: /Slice:\s/.test(raw),
      source_arg: /Source:\s/.test(raw),
      request_arg: /Request:\s/.test(raw),
      story_modes: [...raw.matchAll(STORY_MODE)].map((m) => m[1]),
      user_story_token: /USER_STORY_WRITTEN/.test(raw),
      // whole-file greps above; the per-node view is `storySteps` below
      stryker: /stryker/i.test(raw),
      push_or_pr: /git\s+push|gh\s+pr|pull request creat/i.test(raw),
      // The task trail is two-tiered while a run is live and moves when it
      // ends. `trail_flat` lists what it matched rather than answering yes:
      // prose naming the `.awc/tasks/` root is not a flat path, so a grader
      // reads the strings instead of trusting a boolean.
      trail_in_progress: /\.awc\/tasks\/in-progress\//.test(raw),
      trail_done: /\.awc\/tasks\/done\//.test(raw),
      trail_flat: [...raw.matchAll(TRAIL_FLAT)].map((m) => m[0]),
    },
  })
}

const workflowNames = new Set(
  workflows
    .map((w) => path.basename(path.dirname(w.file)))
    .filter((n) => n && n !== '.'),
)

const skillRoster = loadHosts()
  .map((h) => h.name)
  .join()

// Package-level facts
const skillRunning =
  runningMdRef && existsSync(runningMdRef)
    ? readFileSync(runningMdRef, 'utf8')
    : null
const runningCandidates = files.filter((f) => /running\.md$/i.test(f))
report.package = {
  // One launcher per supported host; graders check all three are present and agree.
  launchers: {
    claude: files
      .filter((f) => rel(f).startsWith('.claude/commands/'))
      .map(rel),
    codex: files.filter((f) => rel(f).startsWith('.codex/skills/')).map(rel),
    opencode: files
      .filter((f) => /^\.opencode\/commands?\//.test(rel(f)))
      .map(rel),
  },
  agentFiles: files.filter((f) => /agents\/[^/]+\.md$/.test(rel(f))).map(rel),
  // A finish node names this path from the launch directory, so graders can
  // compare `finish_task_ref` above against where the file really is.
  finishTaskScripts: files
    .filter((f) => /finish-task\.sh$/.test(rel(f)))
    .map(rel),
  scriptFiles: files
    .filter((f) => /scripts\/[^/]+\.(sh|mjs|ts|js|py)$/.test(rel(f)))
    .map((f) => ({
      file: rel(f),
      executable: isExec(f),
      lines: readFileSync(f, 'utf8').split('\n').length,
    })),
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
    verbatimCopyOfSkill:
      skillRunning !== null ? readFileSync(f, 'utf8') === skillRunning : null,
  })),
  allFiles: files.map(rel).sort(),
}

console.log(JSON.stringify(report, null, 2))
