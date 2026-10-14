// Ensures the bundled Sherlock manifest exists before `next build`.
// The committed copy is used as-is; a checkout without it (e.g. a file-only
// deploy) downloads the current one, so the offline fallback is never missing.
import { existsSync, writeFileSync } from "node:fs";

const target = new URL("../lib/sherlock/data.json", import.meta.url);
const SOURCE = "https://raw.githubusercontent.com/sherlock-project/sherlock/master/sherlock_project/resources/data.json";

if (!existsSync(target)) {
  const res = await fetch(SOURCE);
  if (!res.ok) throw new Error(`Could not download the Sherlock manifest: HTTP ${res.status}`);
  const data = await res.json();
  writeFileSync(target, JSON.stringify(data, null, 2) + "\n");
  console.log(`Downloaded Sherlock manifest (${Object.keys(data).length - 1} sites).`);
}
