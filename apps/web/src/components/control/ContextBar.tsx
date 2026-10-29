import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { type ContextWindowSnapshot, formatContextWindowTokens } from "~/lib/contextWindow";

/**
 * Design v1's context (§4.6), one row (owner, 29 Oct): the chat's share of the window on a sunken
 * track with the auto-compact mark, then `used / compacts at` (or `used / window` for a chat that
 * never compacts). The hover names all three.
 */
export function ContextBar({ usage }: { readonly usage: ContextWindowSnapshot }) {
  const max = usage.maxTokens;
  if (max == null || max <= 0) return null;
  const used = Math.min(usage.usedTokens, max);
  const threshold = usage.compactsAutomatically ? (usage.autoCompactThreshold ?? null) : null;
  const tokens = formatContextWindowTokens;
  return (
    <Tooltip>
      <TooltipTrigger render={<div className="d-ctxw" />}>
        <div className="d-cbar">
          <i className="d-cs" data-k="chat" style={{ width: `${(used / max) * 100}%` }} />
          {threshold === null ? null : (
            <span className="d-cmark" style={{ left: `${Math.min(1, threshold / max) * 100}%` }} />
          )}
        </div>
        <span className="d-ctxn">
          <b>{tokens(used)}</b> / {tokens(threshold ?? max)}
        </span>
      </TooltipTrigger>
      <TooltipPopup side="top">
        {tokens(used)} used
        {threshold === null ? "" : ` · compacts at ${tokens(threshold)}`} · {tokens(max)} window
      </TooltipPopup>
    </Tooltip>
  );
}
