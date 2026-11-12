import * as Context from "effect/Context";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Tracer from "effect/Tracer";

let delegate: Tracer.Tracer | null = null;

const epochMsToNanos = (ms: number) => BigInt(Math.round(ms * 1_000)) * 1_000n;

/**
 * Exports a span that has already happened, such as an interaction the browser timed. Dropped
 * while no exporter is configured.
 */
export function recordSpan(input: {
  readonly name: string;
  readonly startEpochMs: number;
  readonly endEpochMs: number;
  readonly attributes: Readonly<Record<string, string | number>>;
}): void {
  if (delegate === null) return;
  const span = delegate.span({
    name: input.name,
    parent: Option.none(),
    annotations: Context.empty(),
    links: [],
    startTime: epochMsToNanos(input.startEpochMs),
    kind: "internal",
    root: true,
    sampled: true,
  });
  for (const [key, value] of Object.entries(input.attributes)) span.attribute(key, value);
  span.end(epochMsToNanos(input.endEpochMs), Exit.void);
}

/**
 * Points the installed tracer at the exporter `configureClientTracing` just built,
 * or at nothing while no exporter is configured.
 */
export function setDelegate(next: Tracer.Tracer | null): void {
  delegate = next;
}

export function hasDelegate(): boolean {
  return delegate !== null;
}

/**
 * Installed once when the client runtime is built, before any exporter exists, so
 * client spans keep flowing to whatever exporter is configured later on.
 */
export const layer = Layer.succeed(
  Tracer.Tracer,
  Tracer.make({
    span(options) {
      return delegate?.span(options) ?? new Tracer.NativeSpan(options);
    },
  }),
);
