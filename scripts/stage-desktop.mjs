// Copies the built SPA (dist/public) into src-tauri/public/ so Tauri can bundle
// it as a resource. Run after `vite build`; wired into the `tauri` build via
// the `desktop:stage` npm script.
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "dist", "public");
const DEST = path.join(ROOT, "src-tauri", "public");

if (!existsSync(SRC)) {
  console.error(`falta ${path.relative(ROOT, SRC)} — rode 'npm run build:web' antes`);
  process.exit(1);
}

await fs.rm(DEST, { recursive: true, force: true });
await fs.cp(SRC, DEST, { recursive: true });
console.log(`SPA copiado → ${path.relative(ROOT, DEST)}`);
