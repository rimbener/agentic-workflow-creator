// Which skill a session opens in. `awc <agent>` starts on workflow-creator;
// `awc <agent> --upgrade` starts on workflow-upgrader; `awc <agent> --edit`
// starts on workflow-runner.
//
// Each mode stages only what its session can use, because an extra skill is
// an extra trigger competing for the model's attention:
//
// - create: the creator alone — nothing exists yet to upgrade or run.
// - upgrade: the upgrader plus the creator, which is not optional company —
//   the upgrader reads the dialect, the agent bases and the validation
//   checklist from `../workflow-creator/`, and every host stages skills as
//   flat siblings, so those paths only resolve while both directories are
//   there.
// - edit: the runner alone. At run time the package's own `running.md` and
//   `agents/workflow_lead.md` are the contract — the YAML was written against
//   the copies beside it — so the runner cites nothing from the creator's
//   folder (test/staging.test.ts pins that), and staging the authoring skills
//   would only invite the session to rewrite what it should be running.
export type Mode = 'create' | 'upgrade' | 'edit'

const SKIP: Record<Mode, string[]> = {
  create: ['workflow-upgrader', 'workflow-runner'],
  upgrade: ['workflow-runner'],
  edit: ['workflow-upgrader', 'workflow-creator'],
}

const PROMPT: Record<Mode, string> = {
  create: 'prompt.md',
  upgrade: 'prompt-upgrade.md',
  edit: 'prompt-edit.md',
}

// parseCli rejects `--upgrade --edit`, so at most one flag arrives true.
export function mode(upgrade: boolean, edit = false): Mode {
  if (upgrade) return 'upgrade'
  if (edit) return 'edit'
  return 'create'
}

// Skill directory names the payload leaves out for this mode.
export function skipSkills(mode: Mode): string[] {
  return SKIP[mode]
}

export function promptFile(mode: Mode): string {
  return PROMPT[mode]
}
