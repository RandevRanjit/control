import { useAtomValue } from "@effect/atom-react";
import { useEffect, useState } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { primaryServerProvidersAtom, serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { Glyph } from "../control/bloom";
import { isProviderUpdateActive } from "../ProviderUpdateLaunchNotification.logic";
import { sessionUpdateNoteView } from "./sessionUpdateNote";

/**
 * CONTROL's Claude update note (HANDOFF-v2 §4): shown while chats run an older
 * CLI than the installed one. Update installs a newer CLI first when one is on
 * offer, then releases idle chats now; working ones queue and update when they
 * go idle. The provider update toast's Update does the same job.
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
  const installing = useAtomValue(primaryServerProvidersAtom).some(isProviderUpdateActive);
  const refresh = query.refresh;
  // A finished install has moved the idle chats on the server, so the counts are stale until read again.
  useEffect(() => {
    if (!installing) return;
    return () => refresh();
  }, [installing, refresh]);
  const view = sessionUpdateNoteView(query.data, installing);
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
          <span>
            Claude {view.version === null ? null : <b className="t-num">{view.version}</b>} is out
          </span>
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
