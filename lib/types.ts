/** Verdict for one username on one site — mirrors Sherlock's QueryStatus. */
export type Verdict = "claimed" | "available" | "unknown" | "illegal" | "waf";

export interface SiteSummary {
  name: string;
  urlMain: string;
  nsfw: boolean;
}

export interface SitesResponse {
  source: "live" | "bundled";
  sites: SiteSummary[];
}

export interface Finding {
  username: string;
  site: string;
  url: string;
  urlMain: string;
  status: Verdict;
  /** Round-trip time in milliseconds, when a request was actually made. */
  ms: number | null;
  /** Why a check was inconclusive (timeout, connection error…). */
  context: string | null;
  /** Arrival order inside the investigation, used for the default sort. */
  seq: number;
}

/** Server-Sent Event payloads emitted by /api/search. */
export type SearchEvent =
  | { type: "plan"; username: string; total: number; source: string }
  | { type: "result"; finding: Omit<Finding, "seq"> }
  | { type: "done"; username: string; seconds: number }
  | { type: "failure"; message: string };

export interface ArchivedCase {
  id: string;
  number: number;
  date: string;
  usernames: string[];
  counts: { found: number; free: number; issues: number };
  findings: Finding[];
}
