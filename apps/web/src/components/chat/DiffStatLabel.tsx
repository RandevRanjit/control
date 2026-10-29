import { memo } from "react";
import { cn } from "~/lib/utils";

export function hasNonZeroStat(stat: { additions: number; deletions: number }): boolean {
  return stat.additions > 0 || stat.deletions > 0;
}

function formatCompactDiffCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    const k = value / 1000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
  }
  if (value < 1_000_000_000) {
    const m = value / 1_000_000;
    return `${m < 10 ? m.toFixed(1).replace(/\.0$/, "") : Math.round(m)}m`;
  }
  const b = value / 1_000_000_000;
  return `${b < 10 ? b.toFixed(1).replace(/\.0$/, "") : Math.round(b)}b`;
}

export const DiffStatLabel = memo(function DiffStatLabel(props: {
  additions: number;
  deletions: number;
  className?: string;
  showParentheses?: boolean;
  layout?: "aligned" | "inline";
}) {
  const { additions, deletions, className, showParentheses = false, layout = "aligned" } = props;
  return (
    <>
      {showParentheses && <span className="text-muted-foreground/70">(</span>}
      <span
        role="group"
        aria-label={`${additions} additions, ${deletions} deletions`}
        className={cn(
          layout === "inline"
            ? "inline-flex items-center gap-1 tabular-nums align-middle"
            : "inline-grid grid-cols-[4ch_4ch] gap-2 text-right tabular-nums align-middle",
          className,
        )}
      >
        {/* A side with nothing stays empty, as Diff's file headers leave it out; the aligned
            grid keeps its cell so columns still line up. */}
        <span aria-hidden="true" className="font-mono text-diff-addition">
          {additions > 0 || deletions === 0 ? `+${formatCompactDiffCount(additions)}` : null}
        </span>
        <span aria-hidden="true" className="font-mono text-diff-deletion">
          {deletions > 0 || additions === 0 ? `-${formatCompactDiffCount(deletions)}` : null}
        </span>
      </span>
      {showParentheses && <span className="text-muted-foreground/70">)</span>}
    </>
  );
});
