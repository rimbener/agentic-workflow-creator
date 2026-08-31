// Which skill a session opens in. `awc <agent>` starts on workflow-creator;
// `awc <agent> --upgrade` starts on workflow-upgrader.
//
// The creator ships in both modes even when the session is an upgrade: the
// upgrader reads the dialect, the agent bases and the validation checklist from
// `../workflow-creator/`, and every host stages skills as flat siblings, so
// that path only resolves while both directories are there. The upgrader, by
// contrast, is staged only for an upgrade — a create session should have
// nothing extra competing for the model's attention.
export type Mode = 'create' | 'upgrade'

const UPGRADE_ONLY_SKILLS = ['workflow-upgrader']

export function mode(upgrade: boolean): Mode {
  return upgrade ? 'upgrade' : 'create'
}

// Skill directory names the payload leaves out for this mode.
export function skipSkills(mode: Mode): string[] {
  return mode === 'upgrade' ? [] : UPGRADE_ONLY_SKILLS
}

export function promptFile(mode: Mode): string {
  return mode === 'upgrade' ? 'prompt-upgrade.md' : 'prompt.md'
}
