import { awakeModels, noteFace } from "@control/client-runtime/localModels";
import type { EnvironmentId } from "@control/contracts";
import { useNavigation } from "@react-navigation/native";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { cn } from "../../lib/cn";
import {
  localModelsEnvironment,
  useConnectedEnvironmentIds,
  useLocalModels,
  useSecondTick,
} from "../../state/localModels";
import { useAtomCommand } from "../../state/use-atom-command";

/**
 * The top of the chat list while a local model is awake (design/hybrid/HANDOFF.md §18, M5):
 * its name, what it's doing, and Sleep. The name opens Settings › Local models.
 */
export function LocalModelNotes() {
  const environmentIds = useConnectedEnvironmentIds();
  return (
    <>
      {environmentIds.map((environmentId) => (
        <EnvironmentNotes key={environmentId} environmentId={environmentId} />
      ))}
    </>
  );
}

function EnvironmentNotes(props: { readonly environmentId: EnvironmentId }) {
  const navigation = useNavigation();
  const snapshot = useLocalModels(props.environmentId);
  const sleep = useAtomCommand(localModelsEnvironment.sleep);
  const awake = snapshot === null ? [] : awakeModels(snapshot);
  const nowMs = useSecondTick(awake.some(({ runtime }) => runtime.state === "waking"));
  return awake.map(({ model, runtime }) => {
    const face = noteFace(runtime, nowMs);
    return (
      <View
        key={model.id}
        className="mx-4 my-1 flex-row items-center gap-3 rounded-2xl bg-grouped-card py-2.5 pl-4 pr-2.5"
      >
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            navigation.navigate("SettingsSheet", {
              screen: "SettingsContent",
              params: { screen: "SettingsLocalModels" },
            })
          }
        >
          <Text className="font-control-medium text-base text-foreground" numberOfLines={1}>
            {model.name}
          </Text>
        </Pressable>
        <Text
          className={cn(
            "min-w-0 flex-1 text-sm",
            face.lamp === "bg" ? "text-adaptive-sky-600-400" : "text-foreground-muted",
          )}
          numberOfLines={1}
        >
          {`${face.before}${face.num}${face.after}`}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            void sleep({ environmentId: props.environmentId, input: { id: model.id } })
          }
          className="rounded-full bg-subtle px-3 py-2 active:opacity-70"
        >
          <Text className="font-control-medium text-sm text-foreground">Sleep</Text>
        </Pressable>
      </View>
    );
  });
}
