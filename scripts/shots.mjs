// Throwaway: drives the built app through the full flow and refreshes the
// README screenshots in docs/. Run: node scripts/shots.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");
const SAMPLE = path.join(root, "e2e/fixtures/sample.mp4");
const OUT = path.join(root, "docs");
const PORT = 5099;
const BASE = `http://localhost:${PORT}`;

const dataDir = path.join(root, "e2e/.data-shots");
fs.rmSync(dataDir, { recursive: true, force: true });

const server = spawn(process.execPath, [path.join(root, "dist/server/index.js")], {
  env: { ...process.env, DATA_DIR: dataDir, PORT: String(PORT), YTDLP_IMPERSONATE: "" },
  stdio: "inherit",
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error("server never came up");
}

async function main() {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1024 },
    deviceScaleFactor: 2,
  });
  const shot = async (name) => {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(OUT, name) });
  };

  await page.goto(BASE);

  // 1. New project + paste-a-link screen.
  await page.getByRole("button", { name: "Projetos" }).click();
  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  await page.locator(".dropzone").waitFor({ state: "visible" });
  await page
    .getByPlaceholder(/Cole o link do vídeo/)
    .fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await page.waitForTimeout(300);
  await shot("screenshot-url.png");

  // 2. Editor with the video loaded (local upload keeps it offline).
  await page.locator('.dropzone input[type="file"]').setInputFiles(SAMPLE);
  await page.locator(".editor").waitFor({ state: "visible" });
  await page.locator(".preview__video").waitFor({ state: "visible" });
  await page.waitForTimeout(1500); // let the first frame paint

  // A few named cuts so the list looks real.
  const cuts = [
    ["Abertura", "00:00:00", "00:00:01"],
    ["Demonstração", "00:00:01", "00:00:02"],
    ["Conclusão", "00:00:02", "00:00:03"],
  ];
  for (let i = 0; i < cuts.length; i++) {
    await page.getByRole("button", { name: "+ Adicionar corte" }).click();
    const row = page.locator(".cut-row").nth(i);
    await row.locator(".cut-row__name").fill(cuts[i][0]);
    await row.locator(".time-input").nth(0).fill(cuts[i][1]);
    await row.locator(".time-input").nth(1).fill(cuts[i][2]);
  }
  await page.waitForTimeout(300);
  await shot("screenshot-editor.png");

  // 3. Progress screen — a few more cuts so ffmpeg has work to catch mid-flight.
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "+ Adicionar corte" }).click();
    const row = page.locator(".cut-row").nth(cuts.length + i);
    await row.locator(".cut-row__name").fill(`Trecho ${i + 1}`);
    await row.locator(".time-input").nth(0).fill("00:00:00");
    await row.locator(".time-input").nth(1).fill("00:00:02");
  }
  await page.getByRole("button", { name: /Processar cortes/ }).click();
  await page.locator(".progress").waitFor({ state: "visible" });
  // snap as soon as something is actively processing (or a couple are done)
  for (let i = 0; i < 120; i++) {
    const processing = await page.locator(".progress-card.is-processing").count();
    const done = await page.locator(".progress-card.is-done").count();
    if (processing > 0 || done >= 2) break;
    if (done === 6) break;
    await sleep(100);
  }
  await shot("screenshot-progress.png");

  // 4. Results screen.
  await page.getByRole("heading", { name: /corte\(s\) prontos/ }).waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForTimeout(800);
  await shot("screenshot-results.png");

  await browser.close();
}

main()
  .then(() => {
    server.kill();
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    server.kill();
    process.exit(1);
  });
