import type { NextRequest } from "next/server";
import { investigate, simulate } from "@/lib/sherlock/engine";
import { loadManifest, type SiteManifest } from "@/lib/sherlock/sites";
import type { SearchEvent } from "@/lib/types";

export const maxDuration = 300;

const USERNAME_RE = /^[^\s/?#\\]{1,64}$/;

/**
 * Streams one username's investigation as Server-Sent Events. The client
 * asks for each suspect separately, so a long list never has to fit inside
 * a single function's time budget.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const username = (params.get("username") ?? "").trim().replace(/^@/, "");
  if (!USERNAME_RE.test(username)) {
    return Response.json({ error: "Nome de usuário inválido." }, { status: 400 });
  }
  const timeoutS = Math.min(60, Math.max(3, Number(params.get("timeout")) || 15));
  const nsfw = params.get("nsfw") === "1";
  const demo = params.get("demo") === "1";
  const wanted = new Set(
    (params.get("sites") ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  const { manifest, source } = await loadManifest();
  const selected: SiteManifest = {};
  for (const [name, info] of Object.entries(manifest)) {
    if (wanted.size && !wanted.has(name.toLowerCase())) continue;
    if (!nsfw && info.isNSFW) continue;
    selected[name] = info;
  }
  const total = Object.keys(selected).length;
  if (total === 0) return Response.json({ error: "Nenhuma rede selecionada." }, { status: 400 });

  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort());
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: SearchEvent) => {
        if (abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          abort.abort();
        }
      };
      const started = Date.now();
      send({ type: "plan", username, total, source: demo ? "simulação" : source });
      try {
        const onResult = (finding: Extract<SearchEvent, { type: "result" }>["finding"]) =>
          send({ type: "result", finding });
        if (demo) await simulate(username, selected, abort.signal, onResult);
        else
          await investigate(
            username,
            selected,
            { timeoutMs: timeoutS * 1000, concurrency: 32, signal: abort.signal },
            onResult,
          );
        send({ type: "done", username, seconds: (Date.now() - started) / 1000 });
      } catch (error) {
        send({ type: "failure", message: error instanceof Error ? error.message : "Falha inesperada" });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
