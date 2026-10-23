// Design v1's shared parts (design/hybrid/v1/index.html). Each emits the
// page's markup, so control-v1.css styles it as the design draws it.
import sprite from "../../control/sprite.svg?raw";

import type { CardState } from "./cardState";

/** The glyph sprite, inlined once at the app root so `<use href="#…">` resolves. */
export function ControlSprite() {
  return <div hidden aria-hidden dangerouslySetInnerHTML={{ __html: sprite }} />;
}

/** A sprite mark (`g-lock`, `g-spark`); every icon is lucide-react's (HANDOFF §20). */
export function Glyph(props: { readonly id: string; readonly className?: string }) {
  return (
    <svg className={props.className ? `gi ${props.className}` : "gi"} aria-hidden="true">
      <use href={`#${props.id}`} />
    </svg>
  );
}

/** `outside` is the open ring: a chat outside the sidebar's view, an asleep local model. */
export function Lamp(props: { readonly st: CardState | "outside" }) {
  return (
    <span className={`lamp st-${props.st}`} data-st={props.st} role="img" aria-label={props.st}>
      <i />
    </span>
  );
}

export function StateBar(props: { readonly st: CardState }) {
  return <span className="sbar compact" data-st={props.st} aria-hidden="true" />;
}

/** Five stacked bars lit from the bottom (§3). */
export function EffortMeter(props: { readonly level: number }) {
  return (
    <span className="d-eff" role="img" aria-label={`effort ${props.level} of 5`}>
      {[5, 4, 3, 2, 1].map((bar) => (
        <i key={bar} className={bar <= props.level ? "on" : undefined} />
      ))}
    </span>
  );
}

/** The stair logo (§3.1). */
export function StairLogo() {
  return (
    <svg
      className="d-logo"
      width="27"
      height="17"
      viewBox="0 0 19 12"
      role="img"
      aria-label="Control"
    >
      <polyline
        points="1,11 1,9 4,9 4,6 7,6 7,3 10,3 10,6 13,6 13,9 16,9 16,11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(1 -1)"
      />
    </svg>
  );
}
