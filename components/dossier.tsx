"use client";

import { useEffect, useState } from "react";
import type { Investigation } from "@/lib/client/use-investigation";
import { SEARCH_LINES } from "@/lib/client/labels";

export type Filter = "found" | "all" | "issues" | "free";

export interface Counts {
  found: number;
  free: number;
  issues: number;
  done: number;
  total: number;
}

export interface FeedLine {
  id: number;
  kind: "found" | "sys" | "err";
  at: string;
  text: string;
}

const C = 2 * Math.PI * 86;

function useTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const stampLabel = { running: "Em andamento", solved: "Caso resolvido", stopped: "Interrompido", failed: "Falhou" };

export function Dossier({
  inv,
  counts,
  feed,
  filter,
  onFilter,
  onStop,
  onNew,
}: {
  inv: Investigation;
  counts: Counts;
  feed: FeedLine[];
  filter: Filter;
  onFilter: (f: Filter) => void;
  onStop: () => void;
  onNew: () => void;
}) {
  const running = inv.status === "running";
  const now = useTick(running);
  const elapsed = ((inv.endedAt ?? now) - inv.startedAt) / 1000;
  const pct = counts.total ? Math.min(100, Math.round((counts.done / counts.total) * 100)) : 0;
  const rate = elapsed > 0.5 ? counts.done / elapsed : 0;
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLine((l) => (l + 1) % SEARCH_LINES.length), 2600);
    return () => clearInterval(t);
  }, [running]);

  const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  return (
    <aside className="dossier glass" aria-label="Painel do caso">
      <div className="dossier-head">
        <span className="case-no">Caso nº {inv.number}</span>
        <span className={`stamp ${inv.status}`}>{inv.archived ? "Arquivado" : stampLabel[inv.status]}</span>
      </div>

      <div className="ring-wrap" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Progresso da investigação">
        <svg className="ring-svg" viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f8e2a3" />
              <stop offset=".55" stopColor="#c9a45c" />
              <stop offset="1" stopColor="#63e6d0" />
            </linearGradient>
          </defs>
          <circle className="ring-ticks" cx="100" cy="100" r="97" />
          <circle className="ring-track" cx="100" cy="100" r="86" />
          <circle className="ring-glow" cx="100" cy="100" r="86" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} />
          <circle className="ring-bar" cx="100" cy="100" r="86" strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} />
          {running && <path className="ring-sweep" d="M100 4 A96 96 0 0 1 168 32" fill="none" />}
        </svg>
        <div className="ring-center">
          <b>{pct}%</b>
          <span>{running ? "examinando" : inv.status === "solved" ? "concluído" : "parado"}</span>
        </div>
      </div>

      <div className="tally" role="group" aria-label="Contagem — clique para filtrar">
        {(
          [
            ["found", "Encontrados", counts.found],
            ["free", "Livres", counts.free],
            ["issues", "Inconclusivos", counts.issues],
          ] as const
        ).map(([key, label, n]) => (
          <button key={key} className={key} aria-pressed={filter === key} onClick={() => onFilter(key)} title={`Mostrar ${label.toLowerCase()}`}>
            <b key={n}>{n}</b>
            <span>{label}</span>
          </button>
        ))}
      </div>

      <dl className="facts">
        <div><dt>Suspeitos</dt><dd title={inv.usernames.join(", ")}>{inv.usernames.map((u) => "@" + u).join(", ")}</dd></div>
        <div><dt>Redes verificadas</dt><dd>{counts.done} / {counts.total || "—"}</dd></div>
        <div><dt>Tempo</dt><dd>{fmt(elapsed)} s</dd></div>
        <div><dt>Ritmo</dt><dd>{rate ? `${fmt(rate)} redes/s` : "—"}</dd></div>
      </dl>

      <div className="telegraph">
        <div className="telegraph-head">{running && <span className="pulse" />}Telégrafo</div>
        <ol aria-live="off">
          {running && <li className="sys" key={`l${line}`}><span className="t">··</span>{SEARCH_LINES[line]}</li>}
          {feed.slice(0, running ? 6 : 7).map((l) => (
            <li key={l.id} className={l.kind}>
              <span className="t">{l.at}</span>
              {l.text}
            </li>
          ))}
        </ol>
      </div>

      <div className="dossier-actions">
        {running ? (
          <button className="btn danger grow" onClick={onStop}>Interromper <kbd>Esc</kbd></button>
        ) : (
          <button className="btn gold grow" onClick={onNew}>Novo caso <kbd>N</kbd></button>
        )}
      </div>
    </aside>
  );
}
