// @effect-diagnostics nodeBuiltinImport:off globalConsole:off globalTimers:off - Host-side harness.
/**
 * The 100 ms check: against the server seed.ts keeps running (it serves apps/web/dist, a
 * production build), walks the everyday interactions in headless Chromium and times each as
 * the app's own timer does (apps/web/src/observability/interactionTiming.ts): Event Timing,
 * from the input to the next paint.
 *
 *   node apps/server/scripts/design-check/latency.ts [--runs 3]
 * Prints each interaction's median and worst; exits 1 when any run is over 100 ms.
 */
import * as NodeUtil from "node:util";

import { UI_INTERACTION_BUDGET_MS } from "@control/contracts";
import { chromium, type Page } from "playwright-core";

import { readSession, signIn } from "./session.ts";

// The page functions run in Chromium; the server program has no DOM lib.
declare const window: any, PerformanceObserver: any, requestAnimationFrame: any;

const { values } = NodeUtil.parseArgs({ options: { runs: { type: "string" } } });
const runs = Number(values.runs ?? 3);
const session = readSession();

/** Collects the slowest Event Timing entry of each interaction in the page. */
async function observe(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.__reactions = new Map();
    new PerformanceObserver((list: any) => {
      for (const entry of list.getEntries()) {
        if (!entry.interactionId) continue;
        const slowest = window.__reactions.get(entry.interactionId) ?? 0;
        window.__reactions.set(entry.interactionId, Math.max(slowest, entry.duration));
      }
    }).observe({ type: "event", durationThreshold: 16 });
  });
}

/** The slowest reaction `act` caused; 0 when every one was under 16 ms. */
async function time(page: Page, act: () => Promise<unknown>): Promise<number> {
  await page.evaluate(() => window.__reactions.clear());
  await act();
  // Entries are delivered after the paint they measure.
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 150))),
      ),
  );
  return page.evaluate(() => Math.max(0, ...window.__reactions.values()));
}

const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const tab = (page: Page, name: string) => page.locator(`[aria-label="${name}"][aria-selected]`);

/** Each step is one interaction, run `runs` times. */
function steps(page: Page): ReadonlyArray<readonly [string, (run: number) => Promise<unknown>]> {
  const cards = page.locator("[data-app-sidebar] [data-thread-item]");
  const editor = page.locator('.t3-ed [contenteditable="true"]');
  const sidebarToggle = button(page, "Toggle main sidebar");
  return [
    ["Open the right panel", () => button(page, "Toggle right panel").click()],
    ["Outputs tab", () => tab(page, "Outputs").click()],
    ["Folder tab", () => tab(page, "Folder").click()],
    ["Git tab", () => tab(page, "Git").click()],
    ["Close the right panel", () => button(page, "Toggle right panel").click()],
    ["Switch thread", (run) => cards.nth(run % 4).click({ position: { x: 120, y: 16 } })],
    ["Key press in the composer", () => editor.press("a")],
    ["Open ⌘K", () => page.keyboard.press("Meta+K")],
    ["Close ⌘K", () => page.keyboard.press("Escape")],
    // The sidebar's own toggle hides it; the title bar's twin brings it back.
    ["Hide the sidebar", () => sidebarToggle.and(page.locator(".t3-tg")).click()],
    ["Show the sidebar", () => sidebarToggle.and(page.locator('[data-sidebar="trigger"]')).click()],
    ["Open Settings", () => button(page, "Settings").click()],
    ["Close Settings", () => button(page, "Close settings").click()],
  ];
}

const browser = await chromium.launch({ headless: true });
let over = 0;
try {
  const page = await (
    await browser.newContext({ viewport: { width: 1512, height: 945 } })
  ).newPage();
  await signIn(page, session);
  await page.goto(`${session.origin}/${session.environmentId}/${session.selectedThreadId}`);
  await page.waitForLoadState("networkidle");
  await observe(page);
  await page.locator('.t3-ed [contenteditable="true"]').click();
  // A whole walk per run, so each close follows its open.
  const walk = steps(page);
  const times = walk.map((): number[] => []);
  for (let run = 0; run < runs; run++) {
    for (const [index, [, act]] of walk.entries())
      times[index]!.push(await time(page, () => act(run)));
  }
  const ms = (value: number) => (value === 0 ? "<16" : String(Math.round(value)));
  const rows = walk.map(([name], index) => {
    const sorted = times[index]!.toSorted((a, b) => a - b);
    const worst = sorted.at(-1)!;
    if (worst > UI_INTERACTION_BUDGET_MS) over += 1;
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const flag = worst > UI_INTERACTION_BUDGET_MS ? "  over" : "";
    return `${name.padEnd(28)} ${ms(median).padStart(6)} ${ms(worst).padStart(6)}${flag}`;
  });
  console.log(`${"Interaction".padEnd(28)} ${"median".padStart(6)} ${"worst".padStart(6)}`);
  for (const row of rows) console.log(row);
  console.log(over === 0 ? "All under 100 ms." : `${over} over 100 ms.`);
} finally {
  await browser.close();
}
process.exitCode = over === 0 ? 0 : 1;
