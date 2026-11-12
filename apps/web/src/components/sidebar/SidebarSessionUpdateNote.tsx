import { useAtomValue } from "@effect/atom-react";
import { useEffect, useState } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { primaryServerProvidersAtom, serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { Glyph } from "../control/bloom";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { isProviderUpdateActive } from "../ProviderUpdateLaunchNotification.logic";
import { claudeUpdateOffer, sessionUpdateNoteView } from "./sessionUpdateNote";

/**
 * CONTROL's one Claude update notice (HANDOFF-v2 §4), in the sidebar and the menu bar: shown
 * while a newer CLI is on offer or chats run an older CLI than the installed one. Update installs
 * the newer CLI first when one is on offer, then releases idle chats now; working ones queue and
 * update when they go idle.
 */
export function SidebarSessionUpdateNote() {
  const environmentId = usePrimaryEnvironmentId();
  const query = useEnvironmentQuery(
    environmentId === null
      ? null
      : serverEnvironment.providerSessionUpdates({ environmentId, input: {} }),
  );
  const updateSessions = useAtomCommand(serverEnvironment.updateProviderSessions);
  const [isPending, setIsPending] = useState(false);
  const providers = useAtomValue(primaryServerProvidersAtom);
  const installing = providers.some(isProviderUpdateActive);
  const refresh = query.refresh;
  // A finished install has moved the idle chats on the server, so the counts are stale until read again.
  useEffect(() => {
    if (!installing) return;
    return () => refresh();
  }, [installing, refresh]);
  const view = sessionUpdateNoteView(query.data, installing, claudeUpdateOffer(providers));
  if (environmentId === null || view === null) return null;

  const handleUpdate = async () => {
    setIsPending(true);
    try {
      await updateSessions({ environmentId, input: {} });
      query.refresh();
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="hy-upd" data-session-update-note>
      <Glyph id="g-spark" />
      {view.kind === "out" ? (
        <>
          {view.failure === null ? (
            <span>
              Claude {view.version === null ? null : <b className="t-num">{view.version}</b>} is out
            </span>
          ) : (
            // Why the last install failed, e.g. the installer's own error.
            <Tooltip>
              <TooltipTrigger
                render={
                  <span>
                    Claude <b className="t-num">{view.version}</b> didn't install
                  </span>
                }
              />
              <TooltipPopup side="top">{view.failure}</TooltipPopup>
            </Tooltip>
          )}
          <button
            type="button"
            className="pill sm"
            disabled={isPending}
            onClick={() => void handleUpdate()}
          >
            Update
          </button>
        </>
      ) : (
        <span>{view.text}</span>
      )}
    </div>
  );
}
