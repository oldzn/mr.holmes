import "server-only";
import bundled from "./data.json";

/**
 * One entry of Sherlock's site manifest (sherlock_project/resources/data.json).
 * Field names are kept exactly as Sherlock writes them so the live manifest
 * can be consumed without translation.
 */
export interface SiteDefinition {
  url: string;
  urlMain: string;
  urlProbe?: string;
  errorType: DetectionMethod | DetectionMethod[];
  errorMsg?: string | string[];
  errorCode?: number | number[];
  regexCheck?: string;
  request_method?: "GET" | "HEAD" | "POST" | "PUT";
  request_payload?: unknown;
  headers?: Record<string, string>;
  isNSFW?: boolean;
  username_claimed: string;
}

export type DetectionMethod = "status_code" | "message" | "response_url";
export type SiteManifest = Record<string, SiteDefinition>;

const MANIFEST_URL =
  "https://raw.githubusercontent.com/sherlock-project/sherlock/master/sherlock_project/resources/data.json";
const EXCLUSIONS_URL =
  "https://raw.githubusercontent.com/sherlock-project/sherlock/refs/heads/exclusions/false_positive_exclusions.txt";
const TTL_MS = 60 * 60 * 1000;

let memo: { at: number; manifest: SiteManifest; source: "live" | "bundled" } | null = null;

function clean(raw: Record<string, unknown>): SiteManifest {
  const copy = { ...raw };
  delete copy["$schema"];
  return copy as unknown as SiteManifest;
}

/**
 * The live manifest carries false-positive fixes the bundled copy lacks, so it
 * is preferred; the bundled copy keeps the app working when GitHub is
 * unreachable. Memoised per server instance for an hour.
 */
export async function loadManifest(): Promise<{ manifest: SiteManifest; source: "live" | "bundled" }> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo;
  let manifest: SiteManifest | null = null;
  let source: "live" | "bundled" = "live";
  try {
    const res = await fetch(MANIFEST_URL, { signal: AbortSignal.timeout(6000) });
    if (res.ok) manifest = clean(await res.json());
    if (manifest) {
      const ex = await fetch(EXCLUSIONS_URL, { signal: AbortSignal.timeout(4000) }).catch(() => null);
      if (ex?.ok) {
        for (const line of (await ex.text()).split("\n")) delete manifest[line.trim()];
      }
    }
  } catch {
    manifest = null;
  }
  if (!manifest || Object.keys(manifest).length === 0) {
    manifest = clean(bundled as Record<string, unknown>);
    source = "bundled";
  }
  memo = { at: Date.now(), manifest, source };
  return memo;
}
