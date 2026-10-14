"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Finding, SearchEvent } from "@/lib/types";
import type { Settings } from "./storage";

export type RunStatus = "running" | "solved" | "stopped" | "failed";

export interface Investigation {
  id: string;
  number: number;
  usernames: string[];
  /** Username currently being swept, null when nothing runs. */
  active: string | null;
  completed: string[];
  totals: Record<string, number>;
  findings: Finding[];
  startedAt: number;
  endedAt: number | null;
  status: RunStatus;
  source: string;
  error: string | null;
  archived: boolean;
}

interface Callbacks {
  onFinding?: (f: Finding) => void;
  onSuspectDone?: (username: string, found: number) => void;
  /** Fired once per run with the final snapshot (solved, stopped or failed). */
  onEnd?: (inv: Investigation) => void;
}

/**
 * Runs one SSE stream per suspect, in sequence, and batches incoming
 * findings into React state once per animation frame so a 480-site sweep
 * never re-renders 480 times.
 */
export function useInvestigation(callbacks: Callbacks) {
  const [inv, setInv] = useState<Investigation | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pending = useRef<Finding[]>([]);
  const frame = useRef(0);
  const seq = useRef(0);
  const cb = useRef(callbacks);
  useEffect(() => {
    cb.current = callbacks;
  });

  const flush = useCallback(() => {
    frame.current = 0;
    const batch = pending.current;
    if (!batch.length) return;
    pending.current = [];
    setInv((cur) => (cur ? { ...cur, findings: [...cur.findings, ...batch] } : cur));
  }, []);

  const queue = useCallback(
    (f: Finding) => {
      pending.current.push(f);
      if (!frame.current) frame.current = requestAnimationFrame(flush);
    },
    [flush],
  );

  const start = useCallback(
    async (usernames: string[], settings: Settings, number: number) => {
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      pending.current = [];
      seq.current = 0;
      const base: Investigation = {
        id: crypto.randomUUID(),
        number,
        usernames,
        active: usernames[0],
        completed: [],
        totals: {},
        findings: [],
        startedAt: Date.now(),
        endedAt: null,
        status: "running",
        source: "",
        error: null,
        archived: false,
      };
      setInv(base);

      let status: RunStatus = "solved";
      let error: string | null = null;
      const all: Finding[] = [];
      const totals: Record<string, number> = {};
      const completed: string[] = [];
      let source = "";
      for (const username of usernames) {
        if (abort.signal.aborted) break;
        setInv((cur) => (cur ? { ...cur, active: username } : cur));
        const qs = new URLSearchParams({
          username,
          timeout: String(settings.timeout),
          nsfw: settings.nsfw ? "1" : "0",
          demo: settings.demo ? "1" : "0",
        });
        if (settings.sites?.length) qs.set("sites", settings.sites.join(","));
        let found = 0;
        try {
          const res = await fetch(`/api/search?${qs}`, { signal: abort.signal, cache: "no-store" });
          if (!res.ok || !res.body) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ?? `O servidor respondeu ${res.status}.`);
          }
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          let buf = "";
          let finished = false;
          while (!finished) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            let cut: number;
            while ((cut = buf.indexOf("\n\n")) >= 0) {
              const chunk = buf.slice(0, cut);
              buf = buf.slice(cut + 2);
              const line = chunk.split("\n").find((l) => l.startsWith("data: "));
              if (!line) continue;
              const ev = JSON.parse(line.slice(6)) as SearchEvent;
              if (ev.type === "plan") {
                totals[ev.username] = ev.total;
                source = ev.source;
                setInv((cur) => (cur ? { ...cur, source: ev.source, totals: { ...cur.totals, [ev.username]: ev.total } } : cur));
              } else if (ev.type === "result") {
                const f: Finding = { ...ev.finding, seq: seq.current++ };
                if (f.status === "claimed") found++;
                all.push(f);
                queue(f);
                cb.current.onFinding?.(f);
              } else if (ev.type === "done") {
                finished = true;
              } else if (ev.type === "failure") {
                throw new Error(ev.message);
              }
            }
          }
          if (!finished && !abort.signal.aborted) throw new Error("A conexão com o servidor caiu no meio da busca.");
        } catch (e) {
          if (abort.signal.aborted) {
            status = "stopped";
            break;
          }
          status = "failed";
          error = e instanceof Error ? e.message : "Falha desconhecida.";
          break;
        }
        flush();
        completed.push(username);
        setInv((cur) => (cur ? { ...cur, completed: [...cur.completed, username] } : cur));
        cb.current.onSuspectDone?.(username, found);
      }
      if (abort.signal.aborted) status = "stopped";
      if (frame.current) cancelAnimationFrame(frame.current);
      frame.current = 0;
      pending.current = [];
      if (abortRef.current !== abort) return; // superseded by a newer run or a reset
      const final: Investigation = { ...base, active: null, completed, totals, findings: all, source, status, error, endedAt: Date.now() };
      setInv(final);
      cb.current.onEnd?.(final);
    },
    [flush, queue],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const load = useCallback((value: Investigation | null) => {
    abortRef.current?.abort();
    abortRef.current = null;
    setInv(value);
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { inv, start, stop, load };
}
