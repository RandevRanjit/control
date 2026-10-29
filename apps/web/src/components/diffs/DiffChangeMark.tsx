import type { FileDiffMetadata } from "@pierre/diffs";

const MARKS = {
  new: ["A", "Added"],
  deleted: ["D", "Deleted"],
  change: ["M", "Modified"],
  "rename-pure": ["R", "Renamed"],
  "rename-changed": ["R", "Renamed"],
} as const;

/** Git's letter for a changed file in a diff's file header (design §5.2), in place of an icon. */
export function DiffChangeMark({ type }: { type: FileDiffMetadata["type"] }) {
  const [mark, label] = MARKS[type];
  return (
    <span
      className="dp-gs flex w-3 shrink-0 items-center justify-center self-center text-2xs"
      data-g={mark}
      aria-label={label}
    >
      {mark}
    </span>
  );
}
