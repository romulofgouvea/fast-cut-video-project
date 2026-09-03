// Boots the built server for Playwright with an isolated, wiped data dir.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, ".data");
fs.rmSync(dataDir, { recursive: true, force: true });

process.env.DATA_DIR = dataDir;
process.env.PORT = process.env.PORT || "5099";
process.env.YTDLP_IMPERSONATE = process.env.YTDLP_IMPERSONATE ?? "";

await import("../../dist/server/index.js");
