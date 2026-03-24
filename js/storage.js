const STORAGE_KEY = "numa_mvp_state_v2";

export function saveState(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
export function loadState(defaultState) {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(defaultState);
    const parsed = JSON.parse(saved);
    return {
      ...structuredClone(defaultState),
      ...parsed,
      userPreferences: { ...structuredClone(defaultState).userPreferences, ...(parsed.userPreferences || {}) },
      cycleData: { ...structuredClone(defaultState).cycleData, ...(parsed.cycleData || {}) },
      forms: { ...structuredClone(defaultState).forms, ...(parsed.forms || {}) }
    };
  } catch {
    return structuredClone(defaultState);
  }
}
