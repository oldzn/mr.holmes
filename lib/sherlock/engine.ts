import "server-only";
import type { Finding, Verdict } from "@/lib/types";
import type { DetectionMethod, SiteDefinition, SiteManifest } from "./sites";

/*
 * TypeScript port of the detection loop in Sherlock's `sherlock()` function
 * (sherlock_project/sherlock.py, MIT, © Sherlock Project). The rules are kept
 * one-to-one so a verdict here means what it means in the CLI:
 *
 *   status_code  → any 2xx is a hit, unless the code is listed in errorCode
 *   message      → a hit when none of errorMsg appears in the body
 *   response_url → redirects are NOT followed; a 2xx on the original URL is a hit
 *
 * The one deliberate difference: results are emitted in completion order
 * instead of manifest order, so the UI can light up as each site answers.
 */

const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64; rv:129.0) Gecko/20100101 Firefox/129.0";
const MAX_BODY_BYTES = 1_500_000;

/** Fingerprints of WAF challenge pages, copied from Sherlock. */
const WAF_HIT_MSGS = [
  ".loading-spinner{visibility:hidden}body.no-js .challenge-running{display:none}body.dark{background-color:#222;color:#d9d9d9}body.dark a{color:#fff}body.dark a:hover{color:#ee730a;text-decoration:underline}body.dark .lds-ring div{border-color:#999 transparent transparent}body.dark .font-red{color:#b20f03}body.dark",
  '<span id="challenge-error-text">',
  "AwsWafIntegration.forceRefreshToken",
  '{return l.onPageView}}),Object.defineProperty(r,"perimeterxIdentifiers",{enumerable:',
];

function interpolate<T>(value: T, username: string): T {
  if (typeof value === "string") return value.replaceAll("{}", username) as T;
  if (Array.isArray(value)) return value.map((v) => interpolate(v, username)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, interpolate(v, username)]),
    ) as T;
  }
  return value;
}

/** Expands `{?}` into the three separators Sherlock tries: _ - . */
export function expandUsernames(raw: string, max = 10): string[] {
  const out: string[] = [];
  for (const token of raw.split(/[\s,]+/)) {
    const name = token.trim().replace(/^@/, "");
    if (!name) continue;
    if (name.includes("{?}")) out.push(...["_", "-", "."].map((s) => name.replaceAll("{?}", s)));
    else out.push(name);
  }
  const seen = new Set<string>();
  return out.filter((n) => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase())).slice(0, max);
}

async function readBody(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BODY_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.byteLength;
  }
  reader.cancel().catch(() => {});
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === "TimeoutError") return "Tempo esgotado";
    if (error.name === "AbortError") return "Cancelado";
    const cause = (error as { cause?: { code?: string } }).cause;
    if (cause?.code === "ENOTFOUND") return "Domínio não encontrado";
    if (cause?.code === "ECONNREFUSED" || cause?.code === "ECONNRESET") return "Conexão recusada";
    if (cause?.code?.startsWith("CERT") || cause?.code?.includes("TLS")) return "Erro de certificado";
  }
  return "Erro de conexão";
}

export async function checkSite(
  username: string,
  site: string,
  info: SiteDefinition,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<Omit<Finding, "seq">> {
  const url = interpolate(info.url, username.replaceAll(" ", "%20"));
  const base = { username, site, url, urlMain: info.urlMain, ms: null, context: null };

  if (info.regexCheck) {
    try {
      if (!new RegExp(info.regexCheck).test(username)) return { ...base, status: "illegal" };
    } catch {
      /* a pattern JS cannot compile is skipped rather than failing the site */
    }
  }

  const methods: DetectionMethod[] = Array.isArray(info.errorType) ? info.errorType : [info.errorType];
  const probe = info.urlProbe ? interpolate(info.urlProbe, username) : url;
  const method = info.request_method ?? (methods.length === 1 && methods[0] === "status_code" ? "HEAD" : "GET");
  const payload = info.request_payload ? interpolate(info.request_payload, username) : undefined;
  const headers: Record<string, string> = { "User-Agent": USER_AGENT, ...(info.headers ?? {}) };
  if (payload !== undefined) headers["Content-Type"] = "application/json";

  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(probe, {
      method,
      headers,
      body: payload !== undefined ? JSON.stringify(payload) : undefined,
      redirect: methods.includes("response_url") ? "manual" : "follow",
      signal: AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]),
      cache: "no-store",
    });
  } catch (error) {
    return { ...base, status: "unknown", context: describeError(error) };
  }

  const needsBody = method !== "HEAD";
  let text = "";
  try {
    text = needsBody ? await readBody(res) : "";
  } catch (error) {
    return { ...base, status: "unknown", context: describeError(error) };
  }
  const ms = Math.round(performance.now() - started);

  if (WAF_HIT_MSGS.some((m) => text.includes(m))) {
    return { ...base, ms, status: "waf", context: "Bloqueado por firewall" };
  }

  let status: Verdict = "unknown";
  if (methods.includes("message")) {
    const errors = Array.isArray(info.errorMsg) ? info.errorMsg : info.errorMsg ? [info.errorMsg] : [];
    status = errors.some((e) => text.includes(e)) ? "available" : "claimed";
  }
  if (methods.includes("status_code") && status !== "available") {
    const codes = info.errorCode === undefined ? [] : Array.isArray(info.errorCode) ? info.errorCode : [info.errorCode];
    status = codes.includes(res.status) || res.status >= 300 || res.status < 200 ? "available" : "claimed";
  }
  if (methods.includes("response_url") && status !== "available") {
    status = res.status >= 200 && res.status < 300 ? "claimed" : "available";
  }
  return { ...base, ms, status };
}

/**
 * Runs every site with bounded concurrency and reports each verdict the
 * moment it lands.
 */
export async function investigate(
  username: string,
  manifest: SiteManifest,
  opts: { timeoutMs: number; concurrency: number; signal: AbortSignal },
  onResult: (finding: Omit<Finding, "seq">) => void,
): Promise<void> {
  const queue = Object.entries(manifest);
  let cursor = 0;
  const worker = async () => {
    while (cursor < queue.length && !opts.signal.aborted) {
      const [site, info] = queue[cursor++];
      onResult(await checkSite(username, site, info, opts.timeoutMs, opts.signal));
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.concurrency, queue.length) }, worker));
}

/** Deterministic, network-free verdicts for exploring the interface. */
export async function simulate(
  username: string,
  manifest: SiteManifest,
  signal: AbortSignal,
  onResult: (finding: Omit<Finding, "seq">) => void,
): Promise<void> {
  const hash = (s: string) => {
    let h = 2166136261;
    for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return (h >>> 0) / 4294967296;
  };
  const entries = Object.entries(manifest).sort((a, b) => hash(username + a[0]) - hash(username + b[0]));
  for (const [site, info] of entries) {
    if (signal.aborted) return;
    const r = hash(`${username.toLowerCase()}::${site}`);
    await new Promise((ok) => setTimeout(ok, 8 + r * 40));
    const status: Verdict = r < 0.17 ? "claimed" : r < 0.86 ? "available" : r < 0.95 ? "unknown" : "waf";
    onResult({
      username,
      site,
      url: interpolate(info.url, username),
      urlMain: info.urlMain,
      status,
      ms: Math.round(120 + r * 2300),
      context: status === "unknown" ? "Simulação" : status === "waf" ? "Bloqueado por firewall" : null,
    });
  }
}
