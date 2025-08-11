export const SAVE_KEY = "darkroom-v1"

export function saveState(payload: unknown) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(payload)) } catch {}
}

export function loadState<T>(fallback: T): T {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch { return fallback }
}
