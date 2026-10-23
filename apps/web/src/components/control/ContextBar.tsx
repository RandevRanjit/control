import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";

/**
 * Design v1's context (§4.6): the chat's share of the window on a sunken
 * track, the auto-compact mark, and a legend of exactly chat, free and compact.
 */
export function ContextBar({ usage }: { readonly usage: ContextWindowSnapshot }) {
  const max = usage.maxTokens;
  if (max == null || max <= 0) return null;
  const used = Math.min(usage.usedTokens, max);
  const threshold = usage.compactsAutomatically ? (usage.autoCompactThreshold ?? null) : null;
  return (
    <div className="d-ctxw">
      <div className="d-cbar">
        <i
          className="d-cs"
          data-k="chat"
          style={{ width: `${(used / max) * 100}%` }}
          title={`chat ${used.toLocaleString("en-GB")} tokens`}
        />
        {threshold === null ? null : (
          <span className="d-cmark" style={{ left: `${Math.min(1, threshold / max) * 100}%` }} />
        )}
      </div>
      <div className="d-legend">
        <span className="d-lg">
          <i data-k="chat" />
          Chat <b>{formatContextWindowTokens(used)}</b>
        </span>
        <span className="d-lg">
          <i data-k="free" />
          Free <b>{formatContextWindowTokens(max - used)}</b>
        </span>
        {threshold === null ? null : (
          <span className="d-lg d-lgc">
            <i />
            Compacts at <b>{formatContextWindowTokens(threshold)}</b>
          </span>
        )}
      </div>
    </div>
  );
}
