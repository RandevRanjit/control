// Shoots the site's figures from the real app on the design check's fictional fixture.
//   1. node apps/server/scripts/design-check/seed.ts   (repo root, leave it running)
//   2. cd apps/site && npm run figures
// Uses apps/server's playwright-core and writes public/fig/app-{field,night}.jpg.
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const require = NodeModule.createRequire(new URL("../../server/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const session = JSON.parse(
  NodeFS.readFileSync(NodePath.join(NodeOS.tmpdir(), "control-design-check.json"), "utf8"),
);
const out = new URL("../public/fig/", import.meta.url).pathname;

// The same sign-in as apps/server/scripts/design-check/shoot.ts.
async function signIn(page) {
  const token = await fetch(`${session.origin}/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: session.bootstrap,
      subject_token_type: "urn:control:params:oauth:token-type:environment-bootstrap",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    }),
  }).then((r) => r.json());
  const { credential } = await fetch(`${session.origin}/api/auth/pairing-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json" },
    body: "{}",
  }).then((r) => r.json());
  await page.goto(session.origin);
  const status = await page.evaluate(
    (value) =>
      fetch("/api/auth/browser-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: value }),
      }).then((r) => r.status),
    credential,
  );
  if (status !== 200) throw new Error(`Browser sign-in failed: ${status}`);
}

const browser = await chromium.launch({ headless: true });
try {
  for (const theme of ["field", "night"]) {
    const context = await browser.newContext({
      viewport: { width: 1512, height: 945 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
      colorScheme: theme === "night" ? "dark" : "light",
    });
    const page = await context.newPage();
    await signIn(page);
    await page.clock.setFixedTime(new Date(session.shownAt));
    await page.goto(`${session.origin}/${session.environmentId}/${session.selectedThreadId}`);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    // The fixture has no git changes to show, so the right panel stays shut.
    const panel = page.getByRole("button", { name: "Toggle right panel", exact: true });
    if ((await panel.getAttribute("aria-pressed")) === "true") await panel.click();
    const editor = page.locator('.t3-ed [contenteditable="true"]');
    await editor.click();
    await page.keyboard.type("see the shot of button.cta on /download: still says 11.2 MB");
    await editor.blur();
    await page.mouse.move(700, 940);
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${out}app-${theme}.jpg`, type: "jpeg", quality: 86 });
    console.log(`${out}app-${theme}.jpg`);
    await context.close();
  }
} finally {
  await browser.close();
}
