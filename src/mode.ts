// Which skill a session opens in. `awc <agent>` starts on workflow-creator;
// `awc <agent> --update` starts on workflow-updater.
//
// The creator ships in both modes even when the session is an update: the
// updater reads the dialect, the agent bases and the validation checklist from
// `../workflow-creator/`, and every host stages skills as flat siblings, so
// that path only resolves while both directories are there. The updater, by
// contrast, is staged only for an update — a create session should have
// nothing extra competing for the model's attention.
export type Mode = 'create' | 'update'

const UPDATE_ONLY_SKILLS = ['workflow-updater']

export function mode(update: boolean): Mode {
  return update ? 'update' : 'create'
}

// Skill directory names the payload leaves out for this mode.
export function skipSkills(mode: Mode): string[] {
  return mode === 'update' ? [] : UPDATE_ONLY_SKILLS
}

export function promptFile(mode: Mode): string {
  return mode === 'update' ? 'prompt-update.md' : 'prompt.md'
}
