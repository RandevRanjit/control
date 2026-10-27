import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { scopeThreadRef } from "@control/client-runtime/environment";
import {
  actionLabel,
  closedLabel,
  filedLabel,
  splitLooseEnds,
} from "@control/client-runtime/state/loose-ends";
import type { EnvironmentId, OrchestrationV2LooseEnd, ThreadId } from "@control/contracts";
import type { StaticScreenProps } from "@react-navigation/native";
import { AsyncResult } from "effect/reactivity";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { tryCopyTextWithHaptic } from "../../lib/copyTextWithHaptic";
import { tryOpenExternalUrl } from "../../lib/openExternalUrl";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { environmentThreadDetails, threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

type LooseEndsTarget = { readonly environmentId: EnvironmentId; readonly threadId: ThreadId };

/** The chat's loose ends (HANDOFF §17.5, LE4b): the popover's list at touch size. */
export function ThreadLooseEndsSheet({ route }: StaticScreenProps<LooseEndsTarget>) {
  const target = route.params;
  const insets = useSafeAreaInsets();
  const thread = useAtomValue(
    environmentThreadDetails.threadAtom(scopeThreadRef(target.environmentId, target.threadId)),
  );
  const preferences = useAtomValue(mobilePreferencesAtom);
  const savePreferences = useAtomSet(updateMobilePreferencesAtom);
  const close = useAtomCommand(threadEnvironment.closeLooseEnd, "close the loose end");
  const reopen = useAtomCommand(threadEnvironment.reopenLooseEnd, "reopen the loose end");
  const clear = useAtomCommand(threadEnvironment.clearLooseEnds, "clear the done loose ends");
  const [nowMs] = useState(() => Date.now());
  const doneOpen = AsyncResult.isSuccess(preferences)
    ? preferences.value.looseEndsDoneExpanded === true
    : false;

  const runs = thread?.projection.runs ?? [];
  const { open, closed } = splitLooseEnds(thread?.projection.looseEnds ?? []);
  const input = (item: OrchestrationV2LooseEnd) => ({
    threadId: target.threadId,
    looseEndId: item.id,
  });
  const settle = (item: OrchestrationV2LooseEnd, outcome: "done" | "dismissed") =>
    void close({ environmentId: target.environmentId, input: { ...input(item), outcome } });
  // The phone can't reach the Mac's files, so a file's path is copied like a command.
  const act = (item: OrchestrationV2LooseEnd) => {
    if (item.action === null) return;
    if (item.action.kind === "link") void tryOpenExternalUrl(item.action.value, "loose-end");
    else
      void tryCopyTextWithHaptic(item.action.value, {
        target: item.action.kind === "file" ? "path" : "command",
      });
  };

  return (
    <ScrollView
      className="flex-1 bg-sheet"
      contentContainerClassName="px-3 pt-4"
      contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
    >
      <View className="flex-row items-baseline gap-2 px-2.5 pb-1">
        <Text className="text-[15px] font-semibold text-foreground">Loose ends</Text>
        {open.length > 0 ? (
          <Text className="text-[13px] text-foreground-tertiary">{open.length} open</Text>
        ) : null}
      </View>
      {open.length === 0 ? (
        <View className="px-2.5 pb-5 pt-4">
          <Text className="text-[15px] font-medium text-foreground-secondary">
            Nothing open in this thread.
          </Text>
          <Text className="text-[15px] text-foreground-tertiary">
            When an agent hands you something to do, it shows here.
          </Text>
        </View>
      ) : (
        open.map((item) => (
          <View key={item.id} className="flex-row items-start gap-2.5 px-2.5 py-3">
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: false }}
              accessibilityLabel={`Done: ${item.line}`}
              hitSlop={8}
              onPress={() => settle(item, "done")}
              className="mt-0.5 size-[22px] rounded-full bg-subtle"
            />
            <View className="min-w-0 flex-1">
              <Text className="text-[15px] font-medium leading-[21px] text-foreground">
                {item.line}
              </Text>
              {item.reason === "" ? null : (
                <Text className="mt-0.5 text-[13.5px] leading-[19px] text-foreground-secondary">
                  {item.reason}
                </Text>
              )}
              <Text className="mt-1.5 text-[11.5px] text-foreground-tertiary">
                {filedLabel(item, runs, nowMs)}
              </Text>
            </View>
            <View className="flex-row items-center gap-0.5">
              {item.action === null ? null : (
                <Pressable
                  onPress={() => act(item)}
                  className="h-[30px] justify-center rounded-full px-3 active:bg-subtle"
                >
                  <Text className="text-[13.5px] text-foreground-secondary">
                    {actionLabel(item.action, false)}
                  </Text>
                </Pressable>
              )}
              <Pressable
                accessibilityLabel={`Dismiss: ${item.line}`}
                onPress={() => settle(item, "dismissed")}
                className="size-[30px] items-center justify-center rounded-full active:bg-subtle"
              >
                <SymbolView name="xmark" size={13} tintColorClassName="accent-icon-muted" />
              </Pressable>
            </View>
          </View>
        ))
      )}
      {closed.length === 0 ? null : (
        <>
          <View className="mt-1 h-10 flex-row items-center border-t border-border pr-1">
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: doneOpen }}
              onPress={() => savePreferences({ looseEndsDoneExpanded: !doneOpen })}
              className="h-full flex-1 flex-row items-center gap-1.5 px-2.5"
            >
              <SymbolView
                name={doneOpen ? "chevron.down" : "chevron.right"}
                size={12}
                tintColorClassName="accent-icon-muted"
              />
              <Text className="text-[14px] font-medium text-foreground-secondary">Done</Text>
              <View className="h-4 min-w-4 items-center justify-center rounded-full bg-subtle px-1">
                <Text className="text-[10px] font-semibold text-foreground">{closed.length}</Text>
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                void clear({
                  environmentId: target.environmentId,
                  input: { threadId: target.threadId },
                })
              }
              className="h-[30px] justify-center rounded-full px-3 active:bg-subtle"
            >
              <Text className="text-[13.5px] text-foreground-secondary">Clear</Text>
            </Pressable>
          </View>
          {doneOpen
            ? closed.map((item) => (
                <View key={item.id} className="flex-row items-start gap-2.5 px-2.5 py-3">
                  <View className="mt-0.5 size-[22px] items-center justify-center rounded-full bg-primary">
                    <SymbolView
                      name="checkmark"
                      size={12}
                      tintColorClassName="accent-primary-foreground"
                    />
                  </View>
                  <View className="min-w-0 flex-1">
                    <Text className="text-[15px] leading-[21px] text-foreground-tertiary line-through">
                      {item.line}
                    </Text>
                    <Text className="mt-1.5 text-[11.5px] text-foreground-tertiary">
                      {closedLabel(item, runs, nowMs)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      void reopen({ environmentId: target.environmentId, input: input(item) })
                    }
                    className="h-[30px] justify-center rounded-full px-3 active:bg-subtle"
                  >
                    <Text className="text-[13.5px] text-foreground-secondary">Undo</Text>
                  </Pressable>
                </View>
              ))
            : null}
        </>
      )}
    </ScrollView>
  );
}
