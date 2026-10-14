"use client";

import { memo, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import type { Finding } from "@/lib/types";
import type { Investigation } from "@/lib/client/use-investigation";
import { verdictLabel } from "@/lib/client/labels";
import { CopyIcon, ExternalIcon, LensIcon } from "./icons";
import type { Counts, Filter } from "./dossier";

export type Sort = "time" | "name" | "fast";

const PAGE = 120;

function host(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const Card = memo(function Card({ f, onCopy }: { f: Finding; onCopy: (f: Finding) => void }) {
  const [iconOk, setIconOk] = useState(true);
  const ref = useRef<HTMLElement>(null);
  const domain = host(f.urlMain || f.url);

  const tilt = (e: PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${(x - 0.5) * 10}deg`);
    el.style.setProperty("--rx", `${(0.5 - y) * 10}deg`);
    el.style.setProperty("--px", `${x * 100}%`);
    el.style.setProperty("--py", `${y * 100}%`);
  };
  const reset = () => {
    ref.current?.style.setProperty("--rx", "0deg");
    ref.current?.style.setProperty("--ry", "0deg");
  };

  return (
    <article
      ref={ref}
      className={`card ${f.status}`}
      onPointerMove={tilt}
      onPointerLeave={reset}
    >
      <div className="card-top">
        <div className="fav" aria-hidden="true">
          {f.site.slice(0, 1).toUpperCase()}
          {iconOk && (
            // eslint-disable-next-line @next/next/no-img-element -- third-party favicons, not worth the image optimiser
            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt="" loading="lazy" onError={() => setIconOk(false)} />
          )}
        </div>
        <div className="card-name">
          <b>{f.site}</b>
          <span>{domain}</span>
        </div>
        <span className={`badge ${f.status}`}>{verdictLabel[f.status]}</span>
      </div>
      {f.status === "claimed" ? (
        <a className="card-url" href={f.url} target="_blank" rel="noopener noreferrer" title={f.url}>
          {f.url.replace(/^https?:\/\/(www\.)?/, "")}
        </a>
      ) : (
        <span className="card-url" title={f.context ?? f.url}>
          {f.context ?? f.url.replace(/^https?:\/\/(www\.)?/, "")}
        </span>
      )}
      <div className="card-foot">
        <span className="speed" title="Tempo de resposta">
          {f.ms != null ? `${f.ms} ms` : "—"}
          <i style={{ ["--w" as string]: `${f.ms != null ? Math.max(6, 100 - Math.min(100, f.ms / 40)) : 0}%` }} />
        </span>
        <button className="mini" onClick={() => onCopy(f)} aria-label={`Copiar link de ${f.site}`} title="Copiar link">
          <CopyIcon />
        </button>
        <a className="mini" href={f.url} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${f.site} em nova aba`} title="Abrir perfil">
          <ExternalIcon />
        </a>
      </div>
    </article>
  );
});

function Segmented({ value, onChange, counts }: { value: Filter; onChange: (f: Filter) => void; counts: Counts & { all: number } }) {
  const opts: { v: Filter; label: string; key: string; n: number }[] = [
    { v: "found", label: "Encontrados", key: "1", n: counts.found },
    { v: "all", label: "Todos", key: "2", n: counts.all },
    { v: "issues", label: "Inconclusivos", key: "3", n: counts.issues },
  ];
  const wrap = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState({ left: 4, width: 0 });
  const active = value === "free" ? null : value;
  useLayoutEffect(() => {
    const btn = wrap.current?.querySelector<HTMLButtonElement>(`[data-v="${active}"]`);
    setPane(btn ? { left: btn.offsetLeft, width: btn.offsetWidth } : { left: 4, width: 0 });
  }, [active, counts.found, counts.all, counts.issues]);

  return (
    <div
      className="seg"
      role="radiogroup"
      aria-label="Filtrar resultados"
      ref={wrap}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const i = Math.max(0, opts.findIndex((o) => o.v === value));
        const next = opts[(i + (e.key === "ArrowRight" ? 1 : opts.length - 1)) % opts.length];
        onChange(next.v);
        wrap.current?.querySelector<HTMLButtonElement>(`[data-v="${next.v}"]`)?.focus();
      }}
    >
      <span className="seg-pane" style={{ left: pane.left, width: pane.width, opacity: pane.width ? 1 : 0 }} aria-hidden="true" />
      {opts.map((o) => (
        <button
          key={o.v}
          data-v={o.v}
          role="radio"
          aria-checked={value === o.v}
          tabIndex={value === o.v || (!active && o.v === "found") ? 0 : -1}
          onClick={() => onChange(o.v)}
        >
          {o.label} <span className="c">{o.n}</span>
        </button>
      ))}
    </div>
  );
}

export function Evidence({
  inv,
  visible,
  counts,
  allCount,
  filter,
  onFilter,
  query,
  onQuery,
  sort,
  onSort,
  suspect,
  onSuspect,
  perSuspect,
  filterRef,
  onCopy,
  onCopyAll,
  onOpenAll,
  onExport,
  exportOpen,
  setExportOpen,
}: {
  inv: Investigation;
  visible: Finding[];
  counts: Counts;
  allCount: number;
  filter: Filter;
  onFilter: (f: Filter) => void;
  query: string;
  onQuery: (q: string) => void;
  sort: Sort;
  onSort: (s: Sort) => void;
  suspect: string | null;
  onSuspect: (u: string | null) => void;
  perSuspect: Record<string, number>;
  filterRef: React.RefObject<HTMLInputElement | null>;
  onCopy: (f: Finding) => void;
  onCopyAll: () => void;
  onOpenAll: () => void;
  onExport: (k: "json" | "csv" | "txt") => void;
  exportOpen: boolean;
  setExportOpen: (o: boolean) => void;
}) {
  const [limit, setLimit] = useState(PAGE);
  const [lastKey, setLastKey] = useState(`${filter}|${query}|${suspect}`);
  const key = `${filter}|${query}|${suspect}`;
  if (key !== lastKey) {
    setLastKey(key);
    setLimit(PAGE);
  }
  const running = inv.status === "running";
  const shown = visible.slice(0, limit);

  return (
    <div className="evidence">
      {inv.archived && (
        <div className="archived-note">
          Caso arquivado em {new Date(inv.startedAt).toLocaleString("pt-BR")} — mostrando as pistas guardadas.
        </div>
      )}
      {inv.usernames.length > 1 && (
        <div className="suspects" role="tablist" aria-label="Suspeitos">
          <button className="suspect" role="tab" aria-selected={suspect === null} onClick={() => onSuspect(null)}>
            Todos <span className="n">{Object.values(perSuspect).reduce((a, b) => a + b, 0)}</span>
          </button>
          {inv.usernames.map((u) => (
            <button key={u} className="suspect" role="tab" aria-selected={suspect === u} onClick={() => onSuspect(u)}>
              {inv.active === u ? <span className="spin" aria-label="investigando" /> : !inv.completed.includes(u) && running ? <span className="wait" aria-label="na fila" /> : null}
              @{u}
              <span className="n">{perSuspect[u] ?? 0}</span>
            </button>
          ))}
        </div>
      )}

      <div className="toolbar glass">
        <Segmented value={filter} onChange={onFilter} counts={{ ...counts, all: allCount }} />
        <label className="filter-box">
          <LensIcon />
          <span className="sr-only">Filtrar por site</span>
          <input ref={filterRef} type="search" value={query} onChange={(e) => onQuery(e.target.value)} placeholder="Filtrar por rede…  (F)" />
        </label>
        <select className="select" value={sort} onChange={(e) => onSort(e.target.value as Sort)} aria-label="Ordenar">
          <option value="time">Ordem de chegada</option>
          <option value="name">Nome A–Z</option>
          <option value="fast">Mais rápidos</option>
        </select>
        <div className="tool-actions">
          <button className="btn sm" onClick={onCopyAll} disabled={!counts.found} title="Copiar todos os links encontrados (C)">Copiar links</button>
          <button className="btn sm" onClick={onOpenAll} disabled={!counts.found} title="Abrir encontrados em abas (O)">Abrir todos</button>
          <button className="btn sm gold" aria-haspopup="menu" aria-expanded={exportOpen} onClick={() => setExportOpen(!exportOpen)} disabled={!allCount}>
            Exportar <kbd>E</kbd>
          </button>
          {exportOpen && (
            <div className="menu-pop glass" role="menu">
              <button role="menuitem" autoFocus onClick={() => onExport("json")}>Dossiê completo (.json)</button>
              <button role="menuitem" onClick={() => onExport("csv")}>Planilha (.csv)</button>
              <button role="menuitem" onClick={() => onExport("txt")}>Só os links encontrados (.txt)</button>
            </div>
          )}
        </div>
      </div>

      {shown.length ? (
        <div className="grid" aria-live="polite">
          {shown.map((f) => (
            <Card key={`${f.username}::${f.site}`} f={f} onCopy={onCopy} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <LensIcon />
          <p>
            {query
              ? "Nenhuma rede com esse nome."
              : running
                ? "Seguindo as pistas…"
                : filter === "found"
                  ? "Nenhum perfil encontrado."
                  : "Nada nesta categoria."}
          </p>
          <span>
            {query
              ? "Limpe o filtro ou procure por outro termo."
              : running
                ? "Cada perfil aparece aqui no instante em que a rede responde."
                : filter === "found"
                  ? "Esse nome parece livre nas redes verificadas. Veja “Inconclusivos” para as que não responderam."
                  : "Troque o filtro acima para ver as demais pistas."}
          </span>
        </div>
      )}
      {visible.length > limit && (
        <button className="btn more" onClick={() => setLimit((l) => l + PAGE)}>
          Mostrar mais {Math.min(PAGE, visible.length - limit)} de {visible.length - limit} restantes
        </button>
      )}
    </div>
  );
}
