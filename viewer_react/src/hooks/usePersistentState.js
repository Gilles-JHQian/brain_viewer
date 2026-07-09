import { useEffect, useRef, useState } from 'react';

// All viewer-preference keys share this prefix/version. Bump the version if a
// stored value's shape or meaning changes in a way that old values would break.
const STORAGE_PREFIX = 'brainViewer:v1:';

function storageKey(key) {
  return STORAGE_PREFIX + key;
}

function readStored(key, fallback) {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey(key));
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    // Missing/corrupt value or storage disabled (private mode) — use the default.
    return fallback;
  }
}

/**
 * useState whose value is persisted to localStorage and restored on next load.
 *
 * Drop-in for useState for JSON-serializable preference values: the initial
 * value comes from storage when present, otherwise `fallback`, and every change
 * is written back. Persistence failures (quota, private mode, no window) are
 * swallowed so the app keeps working without it.
 *
 * `key` should be a stable string; it is namespaced under STORAGE_PREFIX.
 */
export default function usePersistentState(key, fallback) {
  // Keep the key stable for the lifetime of the hook instance; changing it would
  // orphan the previous entry. Capture the first key and ignore later changes.
  const keyRef = useRef(key);
  const [value, setValue] = useState(() => readStored(keyRef.current, fallback));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey(keyRef.current), JSON.stringify(value));
    } catch {
      // ignore (quota exceeded / private mode / storage disabled)
    }
  }, [value]);

  return [value, setValue];
}
