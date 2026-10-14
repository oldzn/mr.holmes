import { connection } from "next/server";
import { loadManifest } from "@/lib/sherlock/sites";
import type { SitesResponse } from "@/lib/types";

export async function GET() {
  await connection();
  const { manifest, source } = await loadManifest();
  const body: SitesResponse = {
    source,
    sites: Object.entries(manifest)
      .map(([name, info]) => ({ name, urlMain: info.urlMain, nsfw: Boolean(info.isNSFW) }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })),
  };
  return Response.json(body);
}
