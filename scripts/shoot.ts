/**
 * Headless screenshots for visual checks.
 *   npx tsx scripts/shoot.ts <url> <out.png> [--wait ms] [--width 1440] [--height 900] [--full] [--reduced]
 */
import { chromium } from "playwright";

const args = process.argv.slice(2);
const opt = (n: string, d?: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : d;
};
const has = (n: string) => args.includes(`--${n}`);
const [url, out] = args;

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: Number(opt("width", "1440")), height: Number(opt("height", "900")) },
    deviceScaleFactor: 1,
    reducedMotion: has("reduced") ? "reduce" : "no-preference",
  });
  const logs: string[] = [];
  page.on("console", (m) => (m.type() === "error" || m.type() === "warning") && logs.push(`${m.type()}: ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(Number(opt("wait", "800")));
  await page.screenshot({ path: out, fullPage: has("full") });
  if (logs.length) console.log(logs.join("\n"));
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
