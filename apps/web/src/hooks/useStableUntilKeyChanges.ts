import { useState } from "react";

/**
 * Keeps `value`'s identity while `key` stays the same, so memoized readers skip re-renders.
 * A new key returns the new value in that same render: the render React re-runs after the
 * state update still executes, and readers may look the value up in data built for it.
 */
export function useStableUntilKeyChanges<T>(value: T, key: string): T {
  const [stable, setStable] = useState({ key, value });
  if (stable.key !== key) setStable({ key, value });
  return stable.key === key ? stable.value : value;
}
