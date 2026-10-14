import type { ArchivedCase } from "@/lib/types";

/** Per-browser preferences and case archive. Every access tolerates a blocked or empty storage. */

export interface Settings {
  timeout: number;
  nsfw: boolean;
  sound: boolean;
  reducedMotion: boolean;
  demo: boolean;
  /** null = every site in the manifest. */
  sites: string[] | null;
}

export const DEFAULT_SETTINGS: Settings = {
  timeout: 15,
  nsfw: false,
  sound: true,
  reducedMotion: false,
  demo: false,
  sites: null,
};

const KEY_SETTINGS = "mrholmes.settings.v1";
const KEY_CASES = "mrholmes.cases.v1";
const KEY_CASE_NO = "mrholmes.caseNo.v1";
const MAX_CASES = 30;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadSettings = (): Settings => ({ ...DEFAULT_SETTINGS, ...read<Partial<Settings>>(KEY_SETTINGS, {}) });
export const saveSettings = (s: Settings) => write(KEY_SETTINGS, s);

export const loadCases = (): ArchivedCase[] => read<ArchivedCase[]>(KEY_CASES, []);
export function archiveCase(c: ArchivedCase): ArchivedCase[] {
  const next = [c, ...loadCases().filter((x) => x.id !== c.id)].slice(0, MAX_CASES);
  write(KEY_CASES, next);
  return next;
}
export function clearCases() {
  write(KEY_CASES, []);
}

/** Case numbers start at 1887 — the year of A Study in Scarlet. */
export function nextCaseNumber(): number {
  const n = read<number>(KEY_CASE_NO, 1886) + 1;
  write(KEY_CASE_NO, n);
  return n;
}
