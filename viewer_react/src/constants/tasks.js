// Selectable datasets ("tasks") for the top-bar task switcher. Each task is an
// independent data bundle (its own manifest + per-reference zscore/electrode
// files) served under a distinct base path; the fsaverage brain GLB
// (/assets/brain_fsaverage.glb) is shared across all tasks.
//
// To add a task: generate its bundle with prepare_data.py + build_viewer_assets.py,
// symlink it under public/<dataBase> (see scripts/dev.sh), and add an entry here.
export const TASKS = [
  { id: 'lexical', label: 'Lexical (No Delay)', dataBase: '/data' },
  { id: 'uniqueness', label: 'Uniqueness Point', dataBase: '/data_up' },
];

export const DEFAULT_TASK_ID = TASKS[0].id;

export function taskById(id) {
  return TASKS.find((task) => task.id === id) ?? TASKS[0];
}
