import type { Finding } from "@/lib/types";
import { verdictLabel } from "./labels";

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

export function exportFindings(kind: "json" | "csv" | "txt", findings: Finding[], caseNo: number, usernames: string[]) {
  const base = `mr-holmes-caso-${caseNo}-${stamp()}`;
  if (kind === "json") {
    const body = {
      caso: caseNo,
      geradoEm: new Date().toISOString(),
      suspeitos: usernames,
      encontrados: findings.filter((f) => f.status === "claimed").length,
      resultados: findings.map((f) => ({ usuario: f.username, site: f.site, url: f.url, resultado: verdictLabel[f.status], ms: f.ms, detalhe: f.context })),
    };
    download(`${base}.json`, JSON.stringify(body, null, 2), "application/json");
  } else if (kind === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;
    const rows = [["usuario", "site", "url", "resultado", "ms", "detalhe"].join(",")];
    for (const f of findings) rows.push([f.username, f.site, f.url, verdictLabel[f.status], f.ms ?? "", f.context ?? ""].map(esc).join(","));
    download(`${base}.csv`, "\uFEFF" + rows.join("\n"), "text/csv;charset=utf-8");
  } else {
    const found = findings.filter((f) => f.status === "claimed");
    const lines = usernames.flatMap((u) => {
      const mine = found.filter((f) => f.username === u);
      return mine.length ? [`# ${u} (${mine.length})`, ...mine.map((f) => f.url), ""] : [];
    });
    download(`${base}.txt`, lines.join("\n"), "text/plain;charset=utf-8");
  }
  return base;
}
