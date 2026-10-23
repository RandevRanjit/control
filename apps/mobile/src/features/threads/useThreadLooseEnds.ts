import { scopeThreadRef } from "@control/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@control/contracts";
import { useNavigation } from "@react-navigation/native";
import { useMemo } from "react";

import { useThreadShell } from "../../state/entities";

/**
 * The chat header's envelope (HANDOFF §17.5): the open count and the sheet it opens. Null for a
 * server that predates loose ends, which sends no count, so the envelope stays away.
 */
export function useThreadLooseEnds(chat: {
  readonly environmentId: EnvironmentId | string;
  readonly threadId: ThreadId | string;
}) {
  const navigation = useNavigation();
  const { target, ref } = useMemo(() => {
    const environmentId = EnvironmentId.make(String(chat.environmentId));
    const threadId = ThreadId.make(String(chat.threadId));
    return { target: { environmentId, threadId }, ref: scopeThreadRef(environmentId, threadId) };
  }, [chat.environmentId, chat.threadId]);
  const count = useThreadShell(ref)?.openLooseEndCount;
  return useMemo(
    () =>
      count === undefined
        ? null
        : { count, open: () => navigation.navigate("ThreadLooseEnds", target) },
    [count, navigation, target],
  );
}
