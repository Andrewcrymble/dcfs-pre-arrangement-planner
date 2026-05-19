import type { FormState } from "./types";

// Browser-side draft persistence for the arranger wizard. The full
// FormState (customer / person / selections / wishes / notes) is
// serialised to localStorage so the arranger can close the tab mid-
// wizard and pick up exactly where they left off on the same device.
//
// We store a single in-flight draft (one wizard session at a time).
// When the final PDF is generated the draft is cleared.

const KEY = "dcfs_wizard_draft";
const VERSION = 1;

export interface DraftRecord {
  version: number;
  savedAt: string; // ISO timestamp
  form: FormState;
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function saveDraft(form: FormState): DraftRecord | null {
  if (!isBrowser()) return null;
  const record: DraftRecord = {
    version: VERSION,
    savedAt: new Date().toISOString(),
    form,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
    return record;
  } catch {
    // Quota / serialization issue — fail silently rather than blocking
    // wizard input. Worst case the user loses unsaved progress.
    return null;
  }
}

export function loadDraft(): DraftRecord | null {
  if (!isBrowser()) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftRecord;
    if (!parsed || parsed.version !== VERSION) return null;
    if (!parsed.form || typeof parsed.form !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (!isBrowser()) return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

// Friendly relative time for the "Saved 2 minutes ago" indicator.
export function timeSince(iso: string): string {
  try {
    const ts = new Date(iso).getTime();
    if (isNaN(ts)) return "";
    const diffMs = Date.now() - ts;
    const sec = Math.round(diffMs / 1000);
    if (sec < 5) return "just now";
    if (sec < 60) return `${sec}s ago`;
    const min = Math.round(sec / 60);
    if (min < 60) return `${min} min ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr} hr ago`;
    const day = Math.round(hr / 24);
    return `${day} day${day === 1 ? "" : "s"} ago`;
  } catch {
    return "";
  }
}
