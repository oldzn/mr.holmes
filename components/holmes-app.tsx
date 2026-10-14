"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ArchivedCase, Finding, SiteSummary, SitesResponse } from "@/lib/types";
import { useInvestigation, type Investigation } from "@/lib/client/use-investigation";
import { archiveCase, clearCases, loadCases, loadSettings, nextCaseNumber, saveSettings, type Settings } from "@/lib/client/storage";
import { sound } from "@/lib/client/sound";
import { exportFindings } from "@/lib/client/export";
import { QUOTES } from "@/lib/client/labels";
import type { HolmesScene } from "./scene/holmes-scene";
import { SceneCanvas } from "./scene/scene-canvas";
import { SearchConsole } from "./search-console";
import { Dossier, type Counts, type FeedLine, type Filter } from "./dossier";
import { Evidence, type Sort } from "./evidence";
import { CasesDrawer, HelpModal, SettingsDrawer, Toasts, type Panel, type Toast } from "./overlays";
import { ArchiveIcon, KeyboardIcon, SlidersIcon } from "./icons";

const noopSubscribe = () => () => {};
/** False during SSR and hydration, true afterwards — gates anything read from localStorage. */
const useHydrated = () => useSyncExternalStore(noopSubscribe, () => true, () => false);

const ISSUE = new Set(["unknown", "waf", "illegal"]);
const clock = () => new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

function Title() {
  const text = "MR. HOLMES";
  return (
    <h1 id="hero-title" className="title" aria-label="Mr. Holmes">
      {[...text].map((ch, i) =>
        ch === " " ? <span key={i} className="sp" /> : <span key={i} className="ch" style={{ ["--i" as string]: i }} aria-hidden="true">{ch}</span>,
      )}
    </h1>
  );
}

export function HolmesApp() {
  const hydrated = useHydrated();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [cases, setCases] = useState<ArchivedCase[]>(loadCases);
  const [panel, setPanel] = useState<Panel>(null);
  const [filter, setFilter] = useState<Filter>("found");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("time");
  const [suspect, setSuspect] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [sites, setSites] = useState<SiteSummary[]>([]);
  const [source, setSource] = useState("");
  const [sitesError, setSitesError] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [solved, setSolved] = useState<{ key: number; found: number } | null>(null);
  const [quote, setQuote] = useState(0);
  const [archived, setArchived] = useState<ArchivedCase | null>(null);

  const scene = useRef<HolmesScene | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const hits = useRef(0);
  const feedId = useRef(0);
  const freeSpin = useRef(false);
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  });

  // ── feedback ─────────────────────────────────────────────────────
  const toast = useCallback((title: string, detail?: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, title, detail, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6500 : 3800);
  }, []);

  const pushFeed = useCallback((kind: FeedLine["kind"], text: string) => {
    setFeed((f) => [{ id: feedId.current++, kind, at: clock(), text }, ...f].slice(0, 12));
  }, []);

  // Close-out: archive, celebrate, tell the operator what happened.
  function closeOut(inv: Investigation) {
    const found = inv.findings.filter((f) => f.status === "claimed");
    const counts = {
      found: found.length,
      free: inv.findings.filter((f) => f.status === "available").length,
      issues: inv.findings.filter((f) => ISSUE.has(f.status)).length,
    };
    if (inv.findings.length) {
      setCases(
        archiveCase({
          id: inv.id,
          number: inv.number,
          date: new Date(inv.startedAt).toISOString(),
          usernames: inv.usernames,
          counts,
          findings: found,
        }),
      );
    }
    const secs = (((inv.endedAt ?? Date.now()) - inv.startedAt) / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
    if (inv.status === "solved") {
      pushFeed("sys", `Caso encerrado em ${secs} s`);
      if (found.length) {
        scene.current?.celebrate();
        if (settingsRef.current.sound) sound.solved();
        if (!settingsRef.current.reducedMotion) setSolved({ key: Date.now(), found: found.length });
      }
      toast(
        found.length ? `Elementar! ${found.length} perfil(is) encontrado(s)` : "Nenhum perfil encontrado",
        `${inv.findings.length} redes verificadas em ${secs} s · caso nº ${inv.number} arquivado (H).`,
      );
    } else if (inv.status === "stopped") {
      pushFeed("err", "Investigação interrompida");
      toast("Investigação interrompida", `${inv.findings.length} redes verificadas antes da parada · as pistas ficam na tela.`);
    } else {
      pushFeed("err", inv.error ?? "Falha");
      toast("A investigação falhou", inv.error ?? "Tente de novo em instantes.", "error");
    }
  }


  // ── investigation ────────────────────────────────────────────────
  const { inv, start, stop, load } = useInvestigation({
    onFinding: (f) => {
      if (f.status !== "claimed") return;
      hits.current++;
      scene.current?.addPin(f.site);
      if (settingsRef.current.sound) sound.hit(hits.current - 1);
      pushFeed("found", `✓ ${f.site} · @${f.username}`);
    },
    onSuspectDone: (u, found) => pushFeed("sys", `@${u}: ${found} perfil(is) encontrado(s)`),
    onEnd: (final) => closeOut(final),
  });

  const phase = !inv ? "idle" : inv.status === "running" ? "searching" : "case";

  useEffect(() => {
    scene.current?.setPhase(phase);
  }, [phase]);

  useEffect(() => {
    document.body.classList.toggle("reduced", settings.reducedMotion);
    if (scene.current) scene.current.reducedMotion = settings.reducedMotion;
  }, [settings.reducedMotion]);

  const onSceneReady = useCallback((s: HolmesScene | null) => {
    scene.current = s;
    if (s) {
      s.reducedMotion = settingsRef.current.reducedMotion;
      s.setPhase("idle");
    }
  }, []);

  useEffect(() => {
    if (!solved) return;
    const t = setTimeout(() => setSolved(null), 2700);
    return () => clearTimeout(t);
  }, [solved]);

  const begin = useCallback(
    (usernames: string[]) => {
      if (inv?.status === "running") return;
      if (settings.sites && settings.sites.length === 0) {
        toast("Nenhuma rede selecionada", "Abra os Ajustes (S) e marque ao menos uma rede.", "error");
        return;
      }
      sound.unlock();
      if (settings.sound) sound.start();
      hits.current = 0;
      setArchived(null);
      setFeed([]);
      setFilter("found");
      setQuery("");
      setSuspect(null);
      scene.current?.clearPins();
      const n = nextCaseNumber();
      pushFeed("sys", `Caso nº ${n} aberto: ${usernames.map((u) => "@" + u).join(", ")}`);
      void start(usernames, settings, n);
    },
    [inv?.status, settings, start, toast, pushFeed],
  );

  const newCase = useCallback(() => {
    if (inv?.status === "running") stop();
    load(null);
    setArchived(null);
    scene.current?.clearPins();
    setTimeout(() => searchRef.current?.focus(), 50);
  }, [inv?.status, stop, load]);

  const openArchived = (c: ArchivedCase) => {
    const restored: Investigation = {
      id: c.id,
      number: c.number,
      usernames: c.usernames,
      active: null,
      completed: c.usernames,
      totals: {},
      findings: c.findings,
      startedAt: new Date(c.date).getTime(),
      endedAt: new Date(c.date).getTime(),
      status: "solved",
      source: "arquivo",
      error: null,
      archived: true,
    };
    load(restored);
    setArchived(c);
    setFeed([{ id: feedId.current++, kind: "sys", at: clock(), text: `Caso nº ${c.number} reaberto do arquivo` }]);
    setFilter("found");
    setSuspect(null);
    setQuery("");
    setPanel(null);
    scene.current?.clearPins();
    c.findings.forEach((f, i) => setTimeout(() => scene.current?.addPin(f.site), i * 60));
    toast(`Caso nº ${c.number} reaberto`, `${c.counts.found} perfis encontrados · somente leitura.`);
  };

  // ── derived ──────────────────────────────────────────────────────
  const scoped = useMemo(() => (inv ? (suspect ? inv.findings.filter((f) => f.username === suspect) : inv.findings) : []), [inv, suspect]);

  const counts: Counts = useMemo(() => {
    if (archived && inv?.archived) {
      return { ...archived.counts, found: scoped.length, done: archived.counts.found + archived.counts.free + archived.counts.issues, total: archived.counts.found + archived.counts.free + archived.counts.issues };
    }
    const c = { found: 0, free: 0, issues: 0, done: scoped.length, total: 0 };
    for (const f of scoped) {
      if (f.status === "claimed") c.found++;
      else if (f.status === "available") c.free++;
      else c.issues++;
    }
    if (inv) {
      const per = inv.totals;
      const names = suspect ? [suspect] : inv.usernames;
      const known = names.map((u) => per[u]).filter((n): n is number => n != null);
      const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0;
      c.total = Math.round(names.reduce((a, u) => a + (per[u] ?? avg), 0));
    }
    return c;
  }, [scoped, inv, suspect, archived]);

  const perSuspect = useMemo(() => {
    const m: Record<string, number> = {};
    for (const f of inv?.findings ?? []) if (f.status === "claimed") m[f.username] = (m[f.username] ?? 0) + 1;
    return m;
  }, [inv]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = scoped.filter((f) =>
      filter === "found" ? f.status === "claimed" : filter === "free" ? f.status === "available" : filter === "issues" ? ISSUE.has(f.status) : true,
    );
    if (q) list = list.filter((f) => f.site.toLowerCase().includes(q) || f.url.toLowerCase().includes(q));
    const rank = (f: Finding) => (f.status === "claimed" ? 0 : f.status === "available" ? 2 : 1);
    if (sort === "name") list = [...list].sort((a, b) => a.site.localeCompare(b.site, "pt-BR", { sensitivity: "base" }));
    else if (sort === "fast") list = [...list].sort((a, b) => (a.ms ?? 1e9) - (b.ms ?? 1e9));
    else if (filter === "all") list = [...list].sort((a, b) => rank(a) - rank(b) || b.seq - a.seq);
    else list = [...list].sort((a, b) => b.seq - a.seq);
    return list;
  }, [scoped, filter, query, sort]);

  // ── actions ──────────────────────────────────────────────────────
  const foundUrls = useCallback(() => scoped.filter((f) => f.status === "claimed").map((f) => f.url), [scoped]);

  const copy = useCallback(
    async (text: string, title: string, detail?: string) => {
      try {
        await navigator.clipboard.writeText(text);
        toast(title, detail);
      } catch {
        toast("Não foi possível copiar", "O navegador bloqueou a área de transferência. Use Exportar → .txt.", "error");
      }
    },
    [toast],
  );

  const copyAll = useCallback(() => {
    const urls = foundUrls();
    if (!urls.length) return toast("Nada para copiar", "Ainda não há perfis encontrados.", "error");
    void copy(urls.join("\n"), `${urls.length} link(s) copiado(s)`, "Um por linha, prontos para colar.");
  }, [foundUrls, copy, toast]);

  const openAll = useCallback(() => {
    const urls = foundUrls().slice(0, 30);
    if (!urls.length) return toast("Nada para abrir", "Ainda não há perfis encontrados.", "error");
    for (const u of urls) window.open(u, "_blank", "noopener,noreferrer");
    toast(`Abrindo ${urls.length} aba(s)…`, "Se só uma abriu, permita pop-ups para este site na barra de endereço.");
  }, [foundUrls, toast]);

  const doExport = useCallback(
    (kind: "json" | "csv" | "txt") => {
      setExportOpen(false);
      if (!inv) return;
      const list = kind === "txt" ? scoped.filter((f) => f.status === "claimed") : scoped;
      if (!list.length) return toast("Nada para exportar", "Ainda não há pistas nesta visão.", "error");
      const name = exportFindings(kind, list, inv.number, suspect ? [suspect] : inv.usernames);
      toast("Dossiê exportado", `${name}.${kind} · ${list.length} linha(s).`);
    },
    [inv, scoped, suspect, toast],
  );

  const updateSettings = (s: Settings) => {
    setSettings(s);
    if (!saveSettings(s)) toast("Ajuste aplicado só nesta aba", "O navegador não permitiu salvar preferências.", "error");
  };

  // ── data ─────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    fetch("/api/sites")
      .then((r) => (r.ok ? (r.json() as Promise<SitesResponse>) : Promise.reject()))
      .then((d) => {
        if (!alive) return;
        setSites(d.sites);
        setSource(d.source);
      })
      .catch(() => alive && setSitesError(true));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (phase !== "idle") return;
    const t = setInterval(() => setQuote((q) => (q + 1) % QUOTES.length), 9000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      document.documentElement.style.setProperty("--mx", `${e.clientX}px`);
      document.documentElement.style.setProperty("--my", `${e.clientY}px`);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  // ── keyboard ─────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
      if (e.key === "Escape") {
        if (exportOpen) return setExportOpen(false);
        if (panel) return setPanel(null);
        if (inv?.status === "running") return stop();
        if (typing) return el.blur();
        return;
      }
      if (typing || panel) return;
      const k = e.key.toLowerCase();
      const act = (fn: () => void) => {
        e.preventDefault();
        fn();
      };
      if (k === "/") act(() => (phase === "idle" ? searchRef.current?.focus() : filterRef.current?.focus()));
      else if (k === "?") act(() => setPanel("help"));
      else if (k === "s") act(() => setPanel("settings"));
      else if (k === "h") act(() => setPanel("cases"));
      else if (k === "n") act(newCase);
      else if (k === "g")
        act(() => {
          freeSpin.current = !freeSpin.current;
          scene.current?.setFreeSpin(freeSpin.current);
          toast(freeSpin.current ? "Globo girando livre" : "Globo de volta ao ritmo normal");
        });
      else if (k === "m")
        act(() => {
          updateSettings({ ...settings, sound: !settings.sound });
          toast(settings.sound ? "Som desligado" : "Som ligado");
        });
      else if (inv) {
        if (k === "1") act(() => setFilter("found"));
        else if (k === "2") act(() => setFilter("all"));
        else if (k === "3") act(() => setFilter("issues"));
        else if (k === "f") act(() => filterRef.current?.focus());
        else if (k === "c") act(copyAll);
        else if (k === "o") act(openAll);
        else if (k === "e") act(() => setExportOpen((o) => !o));
        else if ((k === "[" || k === "]") && inv.usernames.length > 1)
          act(() => {
            const order = [null, ...inv.usernames];
            const i = order.indexOf(suspect);
            setSuspect(order[(i + (k === "]" ? 1 : order.length - 1)) % order.length]);
          });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const q = QUOTES[quote];

  return (
    <>
      <SceneCanvas onReady={onSceneReady} />
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />
      <div className="spotlight" aria-hidden="true" />

      <div className="app">
        <header className="topbar">
          <button className="brand" onClick={newCase} aria-label="Mr. Holmes — novo caso">
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny local SVG mark */}
            <img className="brand-mark" src="/mark.svg" alt="" width={36} height={36} />
            <span className="brand-text">
              <strong>Mr. Holmes</strong>
              <small>221B · Localizador</small>
            </span>
          </button>
          <div className={`status-pill${hydrated && (sitesError || settings.demo) ? " warn" : ""}`} role="status">
            <span className="dot" />
            {!hydrated ? (
              <span>Conectando…</span>
            ) : sitesError ? (
              <span>Laboratório fora do ar</span>
            ) : settings.demo ? (
              <span><b>Modo simulação</b><span className="extra"> · nada é consultado</span></span>
            ) : sites.length ? (
              <span><b>{sites.filter((s) => settings.nsfw || !s.nsfw).length}</b> redes<span className="extra"> · base {source === "live" ? "ao vivo" : "embutida"}</span></span>
            ) : (
              <span>Conectando…</span>
            )}
          </div>
          <nav className="top-actions" aria-label="Ações">
            <button className="icon-btn" onClick={() => setPanel("cases")} title="Casos arquivados (H)">
              <ArchiveIcon /><span className="lbl">Casos</span><kbd>H</kbd>
            </button>
            <button className="icon-btn" onClick={() => setPanel("settings")} title="Ajustes (S)">
              <SlidersIcon /><span className="lbl">Ajustes</span><kbd>S</kbd>
            </button>
            <button className="icon-btn" onClick={() => setPanel("help")} title="Atalhos (?)" aria-label="Atalhos de teclado">
              <KeyboardIcon /><kbd>?</kbd>
            </button>
          </nav>
        </header>

        <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {!inv ? (
            <section className="hero" aria-labelledby="hero-title">
              <p className="eyebrow"><span className="line" />Agência de Investigação Digital<span className="line" /></p>
              <Title />
              <p className="quote" key={quote}>
                “{q.text}”<cite>— {q.from}</cite>
              </p>
              <SearchConsole ref={searchRef} disabled={false} onSubmit={begin} onError={(m) => toast("Falta o suspeito", m, "error")} />
              <div className="stats">
                <div><b>{hydrated && sites.length ? sites.filter((s) => settings.nsfw || !s.nsfw).length : "—"}</b><span>redes vigiadas</span></div>
                <div><b>32</b><span>consultas paralelas</span></div>
                <div><b>{hydrated ? cases.length : "—"}</b><span>casos arquivados</span></div>
              </div>
            </section>
          ) : (
            <section className="case" aria-label={`Caso nº ${inv.number}`}>
              <Dossier inv={inv} counts={counts} feed={feed} filter={filter} onFilter={setFilter} onStop={stop} onNew={newCase} />
              <Evidence
                inv={inv}
                visible={visible}
                counts={counts}
                allCount={scoped.length}
                filter={filter}
                onFilter={setFilter}
                query={query}
                onQuery={setQuery}
                sort={sort}
                onSort={setSort}
                suspect={suspect}
                onSuspect={setSuspect}
                perSuspect={perSuspect}
                filterRef={filterRef}
                onCopy={(f) => void copy(f.url, "Link copiado", `${f.site} · @${f.username}`)}
                onCopyAll={copyAll}
                onOpenAll={openAll}
                onExport={doExport}
                exportOpen={exportOpen}
                setExportOpen={setExportOpen}
              />
            </section>
          )}
        </main>

        <footer className="foot">
          Motor de detecção portado do{" "}
          <a href="https://github.com/sherlock-project/sherlock" target="_blank" rel="noopener noreferrer">Sherlock Project</a> (MIT) · Use com
          responsabilidade: verifique a sua própria pegada digital ou investigações autorizadas.
        </footer>
      </div>

      {panel === "settings" && <SettingsDrawer settings={settings} onChange={updateSettings} sites={sites} source={source} onClose={() => setPanel(null)} />}
      {panel === "cases" && (
        <CasesDrawer
          cases={cases}
          onOpen={openArchived}
          onClear={() => {
            clearCases();
            setCases([]);
            toast("Arquivo apagado", "Todos os casos deste navegador foram removidos.");
          }}
          onClose={() => setPanel(null)}
        />
      )}
      {panel === "help" && <HelpModal onClose={() => setPanel(null)} />}

      {solved && (
        <div className="solved" key={solved.key} aria-hidden="true">
          <div>
            <strong>Caso resolvido</strong>
            <span>{solved.found} perfil(is) encontrado(s)</span>
          </div>
        </div>
      )}
      <Toasts items={toasts} />
    </>
  );
}
