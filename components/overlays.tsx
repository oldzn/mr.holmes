"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ArchivedCase, SiteSummary } from "@/lib/types";
import type { Settings } from "@/lib/client/storage";
import { CloseIcon } from "./icons";

export type Panel = "settings" | "cases" | "help" | null;

function Shell({ kind, title, onClose, children }: { kind: "drawer" | "modal"; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("button, input")?.focus();
    return () => prev?.focus?.();
  }, []);
  return (
    <>
      <button className="scrim" aria-label="Fechar painel" onClick={onClose} tabIndex={-1} />
      <div ref={ref} className={`${kind} glass`} role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Fechar">
            <CloseIcon />
            <kbd>Esc</kbd>
          </button>
        </header>
        {children}
      </div>
    </>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className="switch" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function SettingsDrawer({
  settings,
  onChange,
  sites,
  source,
  onClose,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  sites: SiteSummary[];
  source: string;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const pool = useMemo(() => sites.filter((s) => settings.nsfw || !s.nsfw), [sites, settings.nsfw]);
  const selected = useMemo(() => new Set(settings.sites ?? pool.map((s) => s.name)), [settings.sites, pool]);
  const listed = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? pool.filter((s) => s.name.toLowerCase().includes(t) || s.urlMain.toLowerCase().includes(t)) : pool;
  }, [pool, q]);
  const count = pool.filter((s) => selected.has(s.name)).length;

  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange({ ...settings, sites: next.size === pool.length ? null : [...next] });
  };
  const setMany = (names: string[], on: boolean) => {
    const next = new Set(selected);
    for (const n of names) {
      if (on) next.add(n);
      else next.delete(n);
    }
    onChange({ ...settings, sites: next.size === pool.length ? null : [...next] });
  };

  return (
    <Shell kind="drawer" title="Ajustes da investigação" onClose={onClose}>
      <div className="drawer-body">
        <div className="field">
          <label htmlFor="timeout">
            Paciência por rede <output>{settings.timeout} s</output>
          </label>
          <input id="timeout" type="range" min={5} max={60} value={settings.timeout} onChange={(e) => onChange({ ...settings, timeout: Number(e.target.value) })} />
          <p className="help">Quanto esperar cada site antes de marcá-lo como inconclusivo. Mais tempo = menos falhas, busca mais lenta.</p>
        </div>
        <div className="field switch-row">
          <div><b>Incluir sites adultos (18+)</b><p className="help">Desligado por padrão.</p></div>
          <Switch on={settings.nsfw} onChange={(v) => onChange({ ...settings, nsfw: v, sites: null })} label="Incluir sites adultos" />
        </div>
        <div className="field switch-row">
          <div><b>Efeitos sonoros</b><p className="help">Um toque a cada perfil encontrado. Atalho: M.</p></div>
          <Switch on={settings.sound} onChange={(v) => onChange({ ...settings, sound: v })} label="Efeitos sonoros" />
        </div>
        <div className="field switch-row">
          <div><b>Movimento reduzido</b><p className="help">Desacelera a cena 3D e remove as explosões de partículas.</p></div>
          <Switch on={settings.reducedMotion} onChange={(v) => onChange({ ...settings, reducedMotion: v })} label="Movimento reduzido" />
        </div>
        <div className="field switch-row">
          <div><b>Modo simulação</b><p className="help">Resultados inventados, sem consultar nenhuma rede. Útil para conhecer a interface.</p></div>
          <Switch on={settings.demo} onChange={(v) => onChange({ ...settings, demo: v })} label="Modo simulação" />
        </div>
        <div className="field">
          <div className="lbl">
            Redes investigadas <span className="muted">{count} de {pool.length}</span>
          </div>
          <div className="site-tools">
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar rede…" aria-label="Procurar rede" />
            <button className="btn sm" onClick={() => setMany(listed.map((s) => s.name), true)}>Marcar {q ? "listadas" : "todas"}</button>
            <button className="btn sm" onClick={() => setMany(listed.map((s) => s.name), false)}>Desmarcar</button>
          </div>
          <ul className="site-list">
            {listed.map((s) => (
              <li key={s.name}>
                <label>
                  <input type="checkbox" checked={selected.has(s.name)} onChange={() => toggle(s.name)} />
                  {s.name}
                  {s.nsfw && <span className="nsfw">18+</span>}
                </label>
              </li>
            ))}
            {!listed.length && <li className="muted" style={{ padding: 10 }}>{sites.length ? "Nenhuma rede com esse nome." : "Carregando a lista de redes…"}</li>}
          </ul>
          <p className="help">
            Base de sites: {source === "live" ? "atualizada do Sherlock Project (ao vivo)" : source === "bundled" ? "cópia embutida (o GitHub não respondeu)" : "carregando…"}.
          </p>
        </div>
      </div>
    </Shell>
  );
}

export function CasesDrawer({
  cases,
  onOpen,
  onClear,
  onClose,
}: {
  cases: ArchivedCase[];
  onOpen: (c: ArchivedCase) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  return (
    <Shell kind="drawer" title="Casos arquivados" onClose={onClose}>
      <div className="drawer-body">
        <p className="help">Guardados só neste navegador. Abra um caso para rever os perfis encontrados.</p>
        {cases.length ? (
          <ol className="case-list">
            {cases.map((c) => (
              <li key={c.id}>
                <button className="case-item" onClick={() => onOpen(c)}>
                  <span className="row">
                    <b>Caso nº {c.number}</b>
                    <small>{new Date(c.date).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</small>
                  </span>
                  <code>{c.usernames.map((u) => "@" + u).join("  ")}</code>
                  <small>
                    {c.counts.found} encontrados · {c.counts.free} livres · {c.counts.issues} inconclusivos
                  </small>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <div className="empty" style={{ padding: "30px 0" }}>
            <p>Arquivo vazio.</p>
            <span>Cada investigação concluída ou interrompida é arquivada aqui automaticamente.</span>
          </div>
        )}
        {cases.length > 0 &&
          (confirm ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn sm danger grow" onClick={() => { onClear(); setConfirm(false); }}>Sim, apagar {cases.length} casos</button>
              <button className="btn sm grow" onClick={() => setConfirm(false)}>Cancelar</button>
            </div>
          ) : (
            <button className="btn sm danger wide" onClick={() => setConfirm(true)}>Apagar todos os casos</button>
          ))}
      </div>
    </Shell>
  );
}

const SHORTCUTS: [string[], string][] = [
  [["/"], "Ir para a busca"],
  [["↵"], "Investigar"],
  [["Esc"], "Interromper / fechar"],
  [["N"], "Novo caso"],
  [["1", "2", "3"], "Encontrados · Todos · Inconclusivos"],
  [["F"], "Filtrar por rede"],
  [["[", "]"], "Suspeito anterior / próximo"],
  [["C"], "Copiar links encontrados"],
  [["O"], "Abrir encontrados em abas"],
  [["E"], "Exportar dossiê"],
  [["H"], "Casos arquivados"],
  [["S"], "Ajustes"],
  [["M"], "Som liga / desliga"],
  [["G"], "Girar o globo"],
  [["?"], "Esta lista"],
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Shell kind="modal" title="Atalhos do detetive" onClose={onClose}>
      <div className="shortcuts">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={label}>
            {keys.map((k) => <kbd key={k}>{k}</kbd>)}
            <span>{label}</span>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export interface Toast {
  id: number;
  title: string;
  detail?: string;
  tone?: "ok" | "error";
}

export function Toasts({ items }: { items: Toast[] }) {
  return (
    <div className="toasts" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.tone === "error" ? "error" : ""}`} role={t.tone === "error" ? "alert" : "status"}>
          <span className="ic">{t.tone === "error" ? "!" : "✓"}</span>
          <div>
            <b>{t.title}</b>
            {t.detail && <span>{t.detail}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
