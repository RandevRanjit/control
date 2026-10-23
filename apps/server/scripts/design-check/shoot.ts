// @effect-diagnostics nodeBuiltinImport:off globalFetch:off globalConsole:off globalDate:off preferSchemaOverJson:off - Host-side harness.
/**
 * The design check's second half: against the server
 * `seed.ts` keeps running, renders the web build in headless Chromium at 1512 × 945
 * @2x with reduced motion, in Field and Night, and compares the sidebar and the
 * centre with design v1.2:
 *   - pixels: a pixel fails when a channel is more than 16/255 off the reference shot;
 *   - parts: every measure.md part of the window, sidebar and centre, by the same
 *     selector, fails when its box is more than 0.5 px off or its font, colour,
 *     background, radius or padding differ.
 * The right panel is out of scope and masked, as is Control's turn minimap.
 *
 *   node apps/server/scripts/design-check/shoot.ts --design <design/hybrid/v1.2> [--out <dir>] [--theme field|night]
 * Writes app-<theme>.png, diff-<theme>.png and report.md to --out; exits 1 while anything fails.
 */
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import { chromium, type Page } from "playwright-core";

// The page functions run in Chromium; the server program has no DOM lib.
declare const document: any, getComputedStyle: any, Image: any;

const SESSION_FILE = NodePath.join(NodeOS.tmpdir(), "control-design-check.json");
const { values } = NodeUtil.parseArgs({
  options: {
    design: { type: "string" },
    out: { type: "string" },
    theme: { type: "string" },
    // Prints this expression's value from the page instead of comparing, for debugging.
    eval: { type: "string" },
    // Also writes crop-<theme>.png: app, design and diff of this region (CSS px "x,y,w,h") side by side.
    crop: { type: "string" },
  },
});
if (!values.design) throw new Error("--design <design/hybrid/v1.2> is required.");
const design = NodePath.resolve(values.design);
const out = NodePath.resolve(values.out ?? NodePath.join(NodeOS.tmpdir(), "control-design-shots"));
NodeFS.mkdirSync(out, { recursive: true });
const themes = (values.theme ? [values.theme] : ["field", "night"]) as ReadonlyArray<
  "field" | "night"
>;
const session = JSON.parse(NodeFS.readFileSync(SESSION_FILE, "utf8")) as {
  origin: string;
  bootstrap: string;
  environmentId: string;
  selectedThreadId: string;
  shownAt: number;
};

/** The regions compared, in CSS px; the right panel (1072–1512) is masked. The centre stops
 *  at 1071: the panel's 1 px edge is the design's shadow there and the app's border at 1072.
 *  It starts at 1: the design draws its window's top lip there, the app's is the real window's. */
const REGIONS = [
  { name: "sidebar", x: 0, y: 0, w: 256, h: 945 },
  { name: "centre", x: 256, y: 1, w: 815, h: 944 },
] as const;
const TOLERANCE = 16;
/** Differences the app keeps on purpose, as "<selector> <what>". */
const ACCEPTED = new Set([
  // The design draws its window's corners; the app's are the real window's.
  "(root) radius",
  // Control's list is virtualised a row at a time under a floating composer, so the
  // design's wrappers have no element: the canvas, the column, a whole turn,
  // and the turn's line drawn whole rather than per row (owner, 9 Oct).
  ".t3-canvas element",
  ".d-col element",
  ".d-turn element",
  ".d-line box",
  // Loose ends sits in the right panel's tab row, which the check leaves alone (owner, 9 Oct).
  ".d-loose box",
]);
/** What the pixel check skips: Control's turn minimap stays, the design has none (owner, 9 Oct). */
const MASKED = '[data-testid="timeline-minimap"] > div > div';

// ---------- measure.md ----------

interface Part {
  readonly section: string;
  readonly label: string;
  readonly selector: string;
  readonly box: ReadonlyArray<number>;
  readonly font: string;
  readonly color: Readonly<Record<string, string>>;
  readonly background: Readonly<Record<string, string>>;
  readonly radius: string;
  readonly padding: string;
}

function readParts(): ReadonlyArray<Part> {
  const parts: Part[] = [];
  let section = "";
  const pair = (value: string) => {
    const [field, night] = value.split(" / ");
    return { field: field!, night: night ?? field! };
  };
  for (const line of NodeFS.readFileSync(NodePath.join(design, "measure.md"), "utf8").split("\n")) {
    if (line.startsWith("## ")) section = line.slice(3);
    if (!/^## (Window|Sidebar|Centre)/.test(`## ${section}`)) continue;
    const cells = line.split(" | ");
    if (cells.length !== 8 || !line.startsWith("| ") || line.startsWith("| part")) continue;
    const label = cells[0]!.slice(2);
    const selector = cells[1]!.replace(/`/g, "");
    if (label === "right panel") continue;
    parts.push({
      section,
      label,
      selector: selector === "(root)" ? "" : selector,
      box: cells[2]!.split(", ").map(Number),
      font: cells[3]!,
      color: pair(cells[4]!),
      background: pair(cells[5]!),
      radius: cells[6]!,
      padding: cells[7]!.replace(/ \|$/, ""),
    });
  }
  return parts;
}

/** measure.cjs's probe, run on the app: the same box, font and colour formatting. */
const PROBE = (selectors: ReadonlyArray<string>) => {
  const hex = (c: string) => {
    if (!c || c === "rgba(0, 0, 0, 0)" || c === "transparent") return "—";
    const sm = c.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)$/);
    if (sm) {
      const a = sm[4] === undefined ? 1 : +sm[4];
      return (
        "#" +
        [1, 2, 3]
          .map((k) =>
            Math.round(Math.min(1, Math.max(0, +sm[k]!)) * 255)
              .toString(16)
              .padStart(2, "0"),
          )
          .join("") +
        (a < 1 ? " @" + Math.round(a * 100) + "%" : "")
      );
    }
    const cv = document.createElement("canvas").getContext("2d")!;
    cv.fillStyle = "#000";
    cv.fillStyle = c;
    const f = String(cv.fillStyle);
    if (f.startsWith("#")) return f;
    const m = f.match(/rgba?\(([^)]+)\)/);
    if (!m) return c;
    const [r, g, b, a] = m[1]!.split(",").map((s) => +s.trim());
    return (
      "#" +
      [r, g, b].map((v) => v!.toString(16).padStart(2, "0")).join("") +
      (a! < 1 ? " @" + Math.round(a! * 100) + "%" : "")
    );
  };
  return selectors.map((sel) => {
    const el = document.querySelector(sel === "" ? ".t3w" : sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const fam = cs.fontFamily.split(",")[0]!.replace(/["']/g, "").replace("Bloom", "");
    const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft]
      .map((v) => parseFloat(v))
      .join(" ");
    return {
      box: [r.left, r.top, r.width, r.height].map((v) => +v.toFixed(1)),
      font:
        el.tagName.toLowerCase() === "svg"
          ? "—"
          : fam +
            " " +
            parseFloat(cs.fontSize) +
            "/" +
            (cs.lineHeight === "normal" ? "n" : parseFloat(cs.lineHeight)) +
            " " +
            cs.fontWeight +
            (cs.letterSpacing !== "normal" && cs.letterSpacing !== "0px"
              ? " ls " + cs.letterSpacing
              : ""),
      color: hex(cs.color),
      background: hex(cs.backgroundColor),
      radius: cs.borderRadius === "0px" ? "0" : cs.borderRadius,
      padding: pad === "0 0 0 0" ? "0" : pad,
    };
  });
};

/** Per region, the pixels more than TOLERANCE off, and a diff image (red where off, the app dimmed elsewhere). */
const DIFF = async (input: {
  app: string;
  reference: string;
  regions: ReadonlyArray<{ name: string; x: number; y: number; w: number; h: number }>;
  masks: ReadonlyArray<{ x: number; y: number; w: number; h: number }>;
  tolerance: number;
}) => {
  const load = async (src: string) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return { canvas, data: context.getImageData(0, 0, image.width, image.height) };
  };
  const app = await load(input.app);
  const reference = await load(input.reference);
  const { width, height } = app.data;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = width;
  outCanvas.height = height;
  const outContext = outCanvas.getContext("2d")!;
  const outData = outContext.createImageData(width, height);
  const scale = width / 1512;
  const counts = input.regions.map((region) => ({ name: region.name, off: 0, total: 0 }));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const a = app.data.data,
        b = reference.data.data;
      const off =
        Math.abs(a[i]! - b[i]!) > input.tolerance ||
        Math.abs(a[i + 1]! - b[i + 1]!) > input.tolerance ||
        Math.abs(a[i + 2]! - b[i + 2]!) > input.tolerance;
      const inside = (r: { x: number; y: number; w: number; h: number }) =>
        x >= r.x * scale && x < (r.x + r.w) * scale && y >= r.y * scale && y < (r.y + r.h) * scale;
      const region = input.masks.some(inside) ? -1 : input.regions.findIndex(inside);
      if (region >= 0) {
        counts[region]!.total++;
        if (off) counts[region]!.off++;
      }
      const grey = (a[i]! + a[i + 1]! + a[i + 2]!) / 3;
      outData.data[i] = region >= 0 && off ? 255 : grey * 0.35;
      outData.data[i + 1] = region >= 0 && off ? 0 : grey * 0.35;
      outData.data[i + 2] = region >= 0 && off ? 0 : grey * 0.35;
      outData.data[i + 3] = 255;
    }
  outContext.putImageData(outData, 0, 0);
  return { counts, diff: outCanvas.toDataURL("image/png") };
};

/** One region of three images, side by side at 2x. */
const CROP = async (input: {
  images: ReadonlyArray<string>;
  x: number;
  y: number;
  w: number;
  h: number;
}) => {
  const scale = 2;
  const canvas = document.createElement("canvas");
  const gap = 16;
  canvas.width = input.images.length * input.w * scale + (input.images.length - 1) * gap;
  canvas.height = input.h * scale;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ff00ff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (const [index, src] of input.images.entries()) {
    const image = new Image();
    image.src = src;
    await image.decode();
    context.drawImage(
      image,
      input.x * scale,
      input.y * scale,
      input.w * scale,
      input.h * scale,
      index * (input.w * scale + gap),
      0,
      input.w * scale,
      input.h * scale,
    );
  }
  return canvas.toDataURL("image/png");
};

async function signIn(page: Page): Promise<void> {
  const tokenResponse = await fetch(`${session.origin}/oauth/token`, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: session.bootstrap,
      subject_token_type: "urn:control:params:oauth:token-type:environment-bootstrap",
      requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
    }),
  });
  const { access_token } = (await tokenResponse.json()) as { access_token: string };
  const pairing = await fetch(`${session.origin}/api/auth/pairing-token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
    body: "{}",
  });
  const { credential } = (await pairing.json()) as { credential: string };
  await page.goto(session.origin);
  const status = await page.evaluate(async (value) => {
    const response = await fetch("/api/auth/browser-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: value }),
    });
    return `${response.status} ${await response.text()}`;
  }, credential);
  if (!status.startsWith("200")) throw new Error(`Browser sign-in failed: ${status}`);
}

const parts = readParts();
const report: string[] = ["# Design check", ""];
let failing = 0;
const browser = await chromium.launch({ headless: true });
/** The panels as the design draws them: thread details closed, the right panel open. */
async function setPanels(page: Page): Promise<void> {
  for (const [label, open] of [
    ["Toggle thread details panel", false],
    ["Toggle right panel", true],
  ] as const) {
    const toggle = page.getByRole("button", { name: label, exact: true });
    if (((await toggle.getAttribute("aria-pressed")) === "true") !== open) await toggle.click();
  }
  // The draft the design's composer holds, typed and left unfocused.
  const editor = page.locator('.t3-ed [contenteditable="true"]');
  await editor.click();
  await page.keyboard.type("see the shot of button.cta on /download: still says 11.2 MB");
  await editor.blur();
  // Off every control, so no hover state or tooltip lands in the shot.
  await page.mouse.move(700, 940);
  await page.waitForLoadState("networkidle");
}

try {
  for (const theme of themes) {
    const context = await browser.newContext({
      viewport: { width: 1512, height: 945 },
      deviceScaleFactor: 2,
      reducedMotion: "reduce",
      colorScheme: theme === "night" ? "dark" : "light",
    });
    // The right panel at the design's 440 px, the width dragging its edge stores for the chat.
    await context.addInitScript(
      (key) => localStorage.setItem(key, "440"),
      `control:preview-panel-width:${session.environmentId}:${session.selectedThreadId}`,
    );
    const page = await context.newPage();
    await signIn(page);
    await page.clock.setFixedTime(new Date(session.shownAt));
    await page.goto(`${session.origin}/${session.environmentId}/${session.selectedThreadId}`);
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => document.fonts.ready);
    await setPanels(page);
    if (values.eval) {
      console.log(JSON.stringify(await page.evaluate(values.eval), null, 1));
      await context.close();
      continue;
    }
    const appPath = NodePath.join(out, `app-${theme}.png`);
    await page.screenshot({ path: appPath });

    const toDataUrl = (file: string) =>
      `data:image/png;base64,${NodeFS.readFileSync(file).toString("base64")}`;
    const { counts, diff } = await page.evaluate(DIFF, {
      app: toDataUrl(appPath),
      reference: toDataUrl(NodePath.join(design, "shots", `window-${theme}.png`)),
      regions: REGIONS,
      masks: await page.evaluate(
        (selector) =>
          [...document.querySelectorAll(selector)].map((element: any) => {
            const box = element.getBoundingClientRect();
            return { x: box.x, y: box.y, w: box.width, h: box.height };
          }),
        MASKED,
      ),
      tolerance: TOLERANCE,
    });
    NodeFS.writeFileSync(
      NodePath.join(out, `diff-${theme}.png`),
      Buffer.from(diff.split(",")[1]!, "base64"),
    );
    if (values.crop) {
      const [x, y, w, h] = values.crop.split(",").map(Number);
      const crop = await page.evaluate(CROP, {
        images: [
          toDataUrl(appPath),
          toDataUrl(NodePath.join(design, "shots", `window-${theme}.png`)),
          diff,
        ],
        x: x!,
        y: y!,
        w: w!,
        h: h!,
      });
      NodeFS.writeFileSync(
        NodePath.join(out, `crop-${theme}.png`),
        Buffer.from(crop.split(",")[1]!, "base64"),
      );
    }

    const probed = await page.evaluate(
      PROBE,
      parts.map((part) => part.selector),
    );
    report.push(`## ${theme}`, "", "| region | pixels off | share |", "|---|---|---|");
    for (const count of counts) {
      report.push(
        `| ${count.name} | ${count.off} | ${((count.off / count.total) * 100).toFixed(2)}% |`,
      );
      if (count.off > 0) failing++;
    }
    report.push(
      "",
      "| section | part | selector | what | design | app |",
      "|---|---|---|---|---|---|",
    );
    parts.forEach((part, index) => {
      const got = probed[index];
      const row = (what: string, want: string, have: string) => {
        if (ACCEPTED.has(`${part.selector || "(root)"} ${what}`)) return;
        report.push(
          `| ${part.section} | ${part.label} | \`${part.selector || "(root)"}\` | ${what} | ${want} | ${have} |`,
        );
        failing++;
      };
      if (!got) return row("element", "present", "missing");
      // A part hidden on both sides has no box; v1 records it at its window's -24, -24.
      const hidden = (box: ReadonlyArray<number>) => box[2] === 0 && box[3] === 0;
      const placed = !hidden(part.box) || !hidden(got.box);
      if (placed && got.box.some((value, i) => Math.abs(value - part.box[i]!) > 0.5))
        row("box", part.box.join(", "), got.box.join(", "));
      if (got.font !== part.font) row("font", part.font, got.font);
      if (got.color !== part.color[theme]) row("colour", part.color[theme]!, got.color);
      if (got.background !== part.background[theme])
        row("background", part.background[theme]!, got.background);
      if (got.radius !== part.radius) row("radius", part.radius, got.radius);
      if (got.padding !== part.padding) row("padding", part.padding, got.padding);
    });
    report.push("");
    await context.close();
  }
} finally {
  await browser.close();
}
NodeFS.writeFileSync(NodePath.join(out, "report.md"), report.join("\n"));
console.log(`${failing} failing · ${NodePath.join(out, "report.md")}`);
process.exitCode = failing > 0 ? 1 : 0;
