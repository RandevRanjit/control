// html[data-motion] is the one motion gate: __root.tsx sets it to "reduce" when Settings >
// Reduce motion is on or the OS asks for less motion. Code outside React reads it here; render
// code uses useReducedMotion (panelAnimations.ts).

export function motionReduced(): boolean {
  return document.documentElement.dataset.motion === "reduce";
}

/** Calls `listener` when the gate flips. Returns the unsubscribe. */
export function onMotionChange(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributeFilter: ["data-motion"] });
  return () => observer.disconnect();
}
