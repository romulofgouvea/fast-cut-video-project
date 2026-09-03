import { test, expect } from "@playwright/test";
import { fileURLToPath } from "node:url";

const SAMPLE = fileURLToPath(new URL("./fixtures/sample.mp4", import.meta.url));

// Each Playwright test gets a fresh browser context, so localStorage starts empty.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

// The app now opens on the Home dashboard; the per-project flow lives behind
// Projetos → + Novo projeto.
async function openNewProject(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Projetos" }).click();
  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  await expect(page.locator(".dropzone")).toBeVisible();
}

test("home shows KPIs and empty galleries", async ({ page }) => {
  await expect(page.locator(".kpi-card")).toHaveCount(4);
  await expect(page.locator(".kpi-card__value").first()).toHaveText("0");

  await page.getByRole("button", { name: "Projetos" }).click();
  await expect(page.locator(".gallery__empty")).toBeVisible();

  await page.getByRole("button", { name: "Editor" }).click();
  await expect(page.locator(".gallery__empty")).toBeVisible();
});

test("local file → editor → cut → process → results", async ({ page }) => {
  await openNewProject(page);
  // Upload the sample video as the source.
  await page.locator('.dropzone input[type="file"]').setInputFiles(SAMPLE);

  // Editor opens with a player and the output options.
  await expect(page.locator(".editor")).toBeVisible();
  await expect(page.locator(".preview__video")).toBeVisible();
  await expect(page.getByRole("button", { name: "GIF" })).toBeVisible();

  // Add a cut and shrink it to fit the 3s clip.
  await page.getByRole("button", { name: "+ Adicionar corte" }).click();
  await page.locator(".time-input").nth(1).fill("00:00:02");

  // Process and land on the results screen with a generated file.
  const process = page.getByRole("button", { name: /Processar cortes/ });
  await expect(process).toBeEnabled();
  await process.click();

  await expect(page.getByRole("heading", { name: /corte\(s\) prontos/ })).toBeVisible({
    timeout: 40_000,
  });
  await expect(page.getByRole("link", { name: "Baixar" }).first()).toBeVisible();
});

test("theme toggle cycles and persists across reload", async ({ page }) => {
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: /Tema:/ }).click();
  await expect(html).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("undo / redo the cut list", async ({ page }) => {
  await openNewProject(page);
  await page.locator('.dropzone input[type="file"]').setInputFiles(SAMPLE);
  await expect(page.locator(".editor")).toBeVisible();

  const rows = page.locator(".cut-row");
  await page.getByRole("button", { name: "+ Adicionar corte" }).click();
  await page.getByRole("button", { name: "+ Adicionar corte" }).click();
  await expect(rows).toHaveCount(2);

  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(rows).toHaveCount(1);

  await page.getByRole("button", { name: "Refazer" }).click();
  await expect(rows).toHaveCount(2);
});
