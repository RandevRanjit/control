// Records the reel's scenes as looping images for the README: public/fig/scene-<name>-<theme>.webp.
//   1. npm run dev              (leave it running)
//   2. npm run loops            (needs `img2webp` on the PATH)
//   npm run loops -- http://localhost:4317 lock    another origin, one scene only
// The scenes' CSS animations are stepped a frame at a time, so every loop closes exactly.
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

const require = NodeModule.createRequire(new URL("../../server/package.json", import.meta.url));
const { chromium } = require("playwright-core");
const [origin = "http://localhost:3000", only] = process.argv.slice(2);
const out = new URL("../public/fig/", import.meta.url).pathname;

// In the reel's order, with how long each scene takes to come round (tokens.css: --T2 or --T).
const SCENES = [
  ["needs", 14],
  ["lock", 14],
  ["browser", 7],
  ["login", 7],
  ["local", 7],
  ["phone", 14],
];
const FPS = 12;
// The plate alone on a clear ground, with room around it for its shadow.
const ALONE = `
  nextjs-portal, .thermal { display: none !important; }
  html, body { background: transparent !important; }
  .panel > :not(.plate) { visibility: hidden; }
  .reel-track { gap: 240px !important; }
`;
const ROOM = { side: 32, top: 24, bottom: 56 };

const browser = await chromium.launch({ headless: true });
try {
  for (const theme of ["night", "field"]) {
    // Narrower than the reel's pinning width, so the panels sit in a plain row at full size.
    const context = await browser.newContext({
      viewport: { width: 800, height: 900 },
      deviceScaleFactor: 1.5,
      colorScheme: theme === "night" ? "dark" : "light",
    });
    const page = await context.newPage();
    await page.goto(`${origin}/control/`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: ALONE });
    for (const [index, [name, seconds]] of SCENES.entries()) {
      if (only && only !== name) continue;
      const plate = page.locator(".panel .plate").nth(index);
      await plate.scrollIntoViewIfNeeded();
      const box = await plate.boundingBox();
      const clip = {
        x: box.x - ROOM.side,
        y: box.y - ROOM.top,
        width: box.width + 2 * ROOM.side,
        height: box.height + ROOM.top + ROOM.bottom,
      };
      const frames = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), `control-loop-${name}-`));
      const args = ["-loop", "0", "-lossy", "-q", "80", "-m", "4"];
      for (let frame = 0; frame < seconds * FPS; frame++) {
        await page.evaluate((time) => {
          for (const animation of document.getAnimations()) {
            animation.pause();
            animation.currentTime = time;
          }
        }, (frame * 1000) / FPS);
        const file = NodePath.join(frames, `${String(frame).padStart(3, "0")}.png`);
        await page.screenshot({ path: file, clip, omitBackground: true });
        // 12 frames a second is 83⅓ ms each: 83, 84, 83.
        args.push("-d", frame % 3 === 1 ? "84" : "83", file);
      }
      const file = `${out}scene-${name}-${theme}.webp`;
      NodeChildProcess.execFileSync("img2webp", [...args, "-o", file]);
      NodeFS.rmSync(frames, { recursive: true });
      console.log(file, `${Math.round(NodeFS.statSync(file).size / 1024)} KB`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
