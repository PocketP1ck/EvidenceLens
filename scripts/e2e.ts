/**
 * Browser end-to-end check (headless Chromium).
 *   npx tsx scripts/e2e.ts live   <outDir>   — starts a Haiku run from the UI (costs ~1 cent)
 *   npx tsx scripts/e2e.ts replay <outDir> <run-id> [speed]  — replays a saved run (no API calls)
 */
import { chromium } from "playwright";

const [mode, out = "/tmp/elshots", runId, speed = "4"] = process.argv.slice(2);
const BASE = process.env.BASE_URL ?? "http://localhost:3100";

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const poses = new Set<string>();
  const track = async () => {
    const p = await page.locator("svg.otter").getAttribute("data-pose").catch(() => null);
    if (p) poses.add(p);
  };

  if (mode === "live") {
    await page.goto(`${BASE}/?model=haiku`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "IL-17A in Crohn's disease" }).click();
    await page.getByRole("button", { name: /Begin investigation/ }).click();
  } else {
    await page.goto(`${BASE}/?replay=${runId}&speed=${speed}`, { waitUntil: "networkidle" });
  }

  const started = Date.now();
  let shot = 0;
  while (Date.now() - started < 6 * 60_000) {
    await track();
    if (await page.locator(".result-card").count()) break;
    if (Date.now() - started > shot * 7000) await page.screenshot({ path: `${out}/${mode}-${shot++}.png` });
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/${mode}-done.png` });
  const status = await page.locator(".status").innerText();
  const href = await page.locator(".result-card a").getAttribute("href").catch(() => null);
  console.log(JSON.stringify({ poses: [...poses], status, href, seconds: Math.round((Date.now() - started) / 1000), errors }));
  if (href) {
    await page.goto(`${BASE}${href}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${out}/${mode}-report.png` });
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
