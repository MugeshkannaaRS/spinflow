/**
 * useDraft — universal sessionStorage draft persistence for entry forms.
 *
 * Persists form state across tab switches, module changes, and accidental
 * navigation. Cleared automatically on successful save.
 *
 * Usage:
 *   const { hasDraft, saveDraft, restoreDraft, discardDraft } = useDraft(key);
 *
 *   // Save on every rows change:
 *   useEffect(() => { saveDraft(rows); }, [rows]);
 *
 *   // After successful mutation:
 *   onSuccess: () => { discardDraft(); ... }
 *
 *   // In JSX, show banner when hasDraft:
 *   {hasDraft && <DraftBanner onRestore={restoreDraft} onDiscard={discardDraft} />}
 */

import { useState, useCallback, useEffect } from "react";

export interface UseDraftReturn<T> {
  /** True when sessionStorage has saved data for this key */
  hasDraft: boolean;
  /**
   * Save current state as draft. Pass `isEmpty` to skip saving blank forms.
   * isEmpty defaults to: every value in the object/array is falsy.
   */
  saveDraft: (state: T, isEmpty?: boolean) => void;
  /** Returns saved state or null if nothing saved */
  restoreDraft: () => T | null;
  /** Removes draft from sessionStorage */
  discardDraft: () => void;
}

export function useDraft<T>(key: string): UseDraftReturn<T> {
  const [hasDraft, setHasDraft] = useState<boolean>(() => {
    try {
      return !!sessionStorage.getItem(key);
    } catch {
      return false;
    }
  });

  // Re-check when key changes (e.g. user switches date/shift/group)
  useEffect(() => {
    try {
      setHasDraft(!!sessionStorage.getItem(key));
    } catch {
      setHasDraft(false);
    }
  }, [key]);

  const saveDraft = useCallback(
    (state: T, isEmpty?: boolean) => {
      if (isEmpty) return; // caller says nothing worth saving
      try {
        sessionStorage.setItem(key, JSON.stringify(state));
        setHasDraft(true);
      } catch {
        /* quota exceeded — silently skip */
      }
    },
    [key],
  );

  const restoreDraft = useCallback((): T | null => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }, [key]);

  const discardDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setHasDraft(false);
  }, [key]);

  return { hasDraft, saveDraft, restoreDraft, discardDraft };
}

/**
 * useLocalDraft — same API as useDraft but backed by localStorage.
 * Use for dialog forms where data should survive page reloads.
 */
export function useLocalDraft<T>(key: string): UseDraftReturn<T> {
  const [hasDraft, setHasDraft] = useState<boolean>(() => {
    try { return !!localStorage.getItem(key); } catch { return false; }
  });

  useEffect(() => {
    try { setHasDraft(!!localStorage.getItem(key)); } catch { setHasDraft(false); }
  }, [key]);

  const saveDraft = useCallback(
    (state: T, isEmpty?: boolean) => {
      if (isEmpty) return;
      try { localStorage.setItem(key, JSON.stringify(state)); setHasDraft(true); } catch { /* quota */ }
    },
    [key],
  );

  const restoreDraft = useCallback((): T | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch { return null; }
  }, [key]);

  const discardDraft = useCallback(() => {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    setHasDraft(false);
  }, [key]);

  return { hasDraft, saveDraft, restoreDraft, discardDraft };
}

/**
 * Default "is empty" check — returns true when no row has any user-typed value.
 * Works for both row arrays and plain objects.
 */
export function isDraftEmpty(state: unknown): boolean {
  if (!state) return true;
  if (Array.isArray(state)) {
    return state.every((item) => {
      if (!item || typeof item !== "object") return true;
      return Object.values(item).every(
        (v) => v === "" || v === null || v === undefined || v === 0 || (Array.isArray(v) && v.length === 0),
      );
    });
  }
  if (typeof state === "object") {
    return Object.values(state as Record<string, unknown>).every(
      (v) => v === "" || v === null || v === undefined || v === 0 || (Array.isArray(v) && v.length === 0),
    );
  }
  return true;
}
