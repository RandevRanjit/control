import { useEffect, useRef } from "react";

import { isElectron } from "../../env";
import { cn } from "../../lib/utils";
import { clockLabel, type LockChat, lockCounts } from "./lock.logic";

// The sidebar's stair (§3.1, `.d-logo`: viewBox 19 × 12, stroke 2) at 20 px a unit, in 5 px cells.
const STAIR: ReadonlyArray<readonly [number, number]> = [
  [2, 10],
  [2, 8],
  [5, 8],
  [5, 5],
  [8, 5],
  [8, 2],
  [11, 2],
  [11, 5],
  [14, 5],
  [14, 8],
  [17, 8],
  [17, 10],
];
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;
const UNIT = 20;
const CELL = 5;
const WIDTH = 17 * UNIT;
const HEIGHT = 10 * UNIT;
const PERIOD_MS = 7000;

const distance = (
  px: number,
  py: number,
  [ax, ay]: readonly [number, number],
  [bx, by]: readonly [number, number],
) => {
  const dx = bx - ax;
  const dy = by - ay;
  const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
};

/**
 * The logo's cells: a cell is part of it when its centre is within the stroke. Each has its place
 * in the band's sweep (`phase`, a share of the period) and its 4 × 4 Bayer threshold, scaled by .6.
 */
const CELLS = Array.from({ length: (WIDTH / CELL) * (HEIGHT / CELL) }, (_, index) => {
  const i = index % (WIDTH / CELL);
  const j = Math.floor(index / (WIDTH / CELL));
  const x = 1 + ((i + 0.5) * CELL) / UNIT;
  const y = 1 + ((j + 0.5) * CELL) / UNIT;
  const inStroke = STAIR.slice(1).some((point, k) => distance(x, y, STAIR[k]!, point) <= 1);
  return inStroke
    ? {
        x: i * CELL,
        y: j * CELL,
        phase: ((i + j / 2) * CELL) / (WIDTH * 1.2),
        threshold: (0.6 * (BAYER[j % 4]![i % 4]! + 0.5)) / 16,
      }
    : null;
}).filter((cell) => cell !== null);

/**
 * The plate's logo with its dithered sweep (HANDOFF §16.3): a band of shadow crosses it once
 * every 7 s; a cell is lit while the light, a raised cosine, is over its threshold, and holds at
 * .22 otherwise. Drawn on a canvas on the document clock, and only when a cell changes; under
 * Reduce motion every cell is lit and nothing runs.
 */
function LockLogo() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const scale = window.devicePixelRatio || 1;
    canvas.width = WIDTH * scale;
    canvas.height = HEIGHT * scale;
    const lit = new Uint8Array(CELLS.length);
    let ink = "";
    const paint = (timeMs: number | null) => {
      const color = getComputedStyle(canvas).color;
      let changed = color !== ink;
      CELLS.forEach((cell, index) => {
        const light = 0.5 + 0.5 * Math.cos(2 * Math.PI * ((timeMs ?? 0) / PERIOD_MS - cell.phase));
        const on = timeMs === null || light > cell.threshold ? 1 : 0;
        if (lit[index] !== on) changed = true;
        lit[index] = on;
      });
      if (!changed) return;
      ink = color;
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, WIDTH, HEIGHT);
      context.fillStyle = color;
      CELLS.forEach((cell, index) => {
        context.globalAlpha = lit[index] === 1 ? 1 : 0.22;
        context.fillRect(cell.x, cell.y, CELL, CELL);
      });
    };
    const root = document.documentElement;
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      if (root.dataset.motion !== "full") return paint(null);
      const tick = () => {
        paint(performance.now());
        frame = requestAnimationFrame(tick);
      };
      tick();
    };
    run();
    // The theme and the motion setting change on the root.
    const observer = new MutationObserver(run);
    observer.observe(root, { attributes: true, attributeFilter: ["data-theme", "data-motion"] });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return <canvas ref={ref} className="s-lk-logo" aria-hidden="true" />;
}

/** The window during a full lock while nothing needs you (HANDOFF §16.3). */
export function LockPlate(props: {
  readonly until: string;
  readonly chats: ReadonlyArray<LockChat>;
}) {
  const { working, done } = lockCounts(props.chats);
  // index.css hides the toasts while the plate shows.
  useEffect(() => {
    document.documentElement.dataset.lockPlate = "";
    return () => {
      delete document.documentElement.dataset.lockPlate;
    };
  }, []);
  return (
    <div className="s-lk-root">
      <main
        className="t3w t3-bloom t3-d s-lk-plate h-dvh w-full"
        aria-label={`Locked until ${clockLabel(Date.parse(props.until))}`}
      >
        <div className={cn("t3-top", isElectron && "drag-region")}>
          {/* Electron draws the real lights here (trafficLightPosition 16, 20). */}
          <span className="lights" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="s-lk-pbody">
          <LockLogo />
          <p className="s-lk-locked">Locked</p>
          <p className="s-lk-until2">
            until <span className="t-num">{clockLabel(Date.parse(props.until))}</span>
          </p>
          <p className="s-lk-count">
            <span className="t-num">{working}</span> working · <span className="t-num">{done}</span>{" "}
            done
          </p>
          <p className="s-lk-pr">
            No early unlock. A chat that needs you opens here, until you've answered it.
          </p>
        </div>
      </main>
    </div>
  );
}
