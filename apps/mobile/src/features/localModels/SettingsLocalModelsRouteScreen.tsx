import { squashAtomCommandFailure } from "@control/client-runtime/state/runtime";
import { memoryLine, rowStatus } from "@control/client-runtime/localModels";
import {
  type EnvironmentId,
  formatGb,
  LOCAL_MODEL_ASK_BYTES,
  type LocalModel,
  type LocalModelRuntime,
} from "@control/contracts";
import { useState } from "react";
import { Alert, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText as Text } from "../../components/AppText";
import { ScreenScrollView as ScrollView } from "../../components/ScreenScrollView";
import { useEnvironments } from "../../state/environments";
import {
  localModelsEnvironment,
  useConnectedEnvironmentIds,
  useLocalModels,
  useSecondTick,
} from "../../state/localModels";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsScreen } from "../settings/components/SettingsScreen";
import { SettingsSection } from "../settings/components/SettingsSection";

/**
 * Settings › Local models on the phone (design/hybrid/HANDOFF.md §18, M5b): every model with
 * Wake and Sleep, under the same memory rule. Adding and editing are on the Mac.
 */
export function SettingsLocalModelsRouteScreen() {
  const insets = useSafeAreaInsets();
  const environmentIds = useConnectedEnvironmentIds();
  const { environments } = useEnvironments();
  return (
    <SettingsScreen title="Local models">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentInset={{ bottom: Math.max(insets.bottom, 18) }}
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="gap-6 px-5 pt-4 pb-[18px]"
      >
        {environmentIds.map((environmentId) => (
          <EnvironmentModels
            key={environmentId}
            environmentId={environmentId}
            label={
              environmentIds.length > 1
                ? (environments.find((environment) => environment.environmentId === environmentId)
                    ?.label ?? null)
                : null
            }
          />
        ))}
        <Text className="px-2 text-sm leading-normal text-foreground-muted">
          Adding a model and editing its command are on the Mac.
        </Text>
      </ScrollView>
    </SettingsScreen>
  );
}

function EnvironmentModels(props: {
  readonly environmentId: EnvironmentId;
  readonly label: string | null;
}) {
  const snapshot = useLocalModels(props.environmentId);
  const nowMs = useSecondTick(
    snapshot?.runtimes.some((runtime) => runtime.state === "waking") ?? false,
  );
  if (snapshot === null) return null;
  return (
    <View className="gap-3">
      <Text className="px-2 text-sm leading-normal text-foreground-muted">
        {memoryLine(snapshot)}
      </Text>
      <SettingsSection {...(props.label === null ? {} : { title: props.label })}>
        {snapshot.models.length === 0 ? (
          <Text className="p-4 text-base text-foreground-muted">No models yet.</Text>
        ) : (
          snapshot.models.map((model, index) => (
            <ModelRow
              key={model.id}
              environmentId={props.environmentId}
              model={model}
              runtime={snapshot.runtimes.find((runtime) => runtime.modelId === model.id)}
              availableBytes={snapshot.memory.availableBytes}
              nowMs={nowMs}
              first={index === 0}
            />
          ))
        )}
      </SettingsSection>
    </View>
  );
}

function ModelRow(props: {
  readonly environmentId: EnvironmentId;
  readonly model: LocalModel;
  readonly runtime: LocalModelRuntime | undefined;
  readonly availableBytes: number;
  readonly nowMs: number;
  readonly first: boolean;
}) {
  const { environmentId, model } = props;
  const runtime = props.runtime ?? {
    modelId: model.id,
    state: "asleep" as const,
    since: new Date(0).toISOString(),
    calls: 0,
  };
  const wake = useAtomCommand(localModelsEnvironment.wake, { reportFailure: false });
  const sleep = useAtomCommand(localModelsEnvironment.sleep);
  const [refusal, setRefusal] = useState<string | null>(null);
  const status = rowStatus(runtime, props.nowMs);
  const asleep = runtime.state === "asleep";

  const sendWake = async (approved: boolean) => {
    setRefusal(null);
    const result = await wake({
      environmentId,
      input: { id: model.id, ...(approved ? { approved: true } : {}) },
    });
    if (result._tag === "Failure") {
      const error = squashAtomCommandFailure(result);
      setRefusal(error instanceof Error ? error.message : "Couldn't wake it.");
    }
  };
  // Over 40 GB, a wake asks first, as it does in a chat (§18.3).
  const onWake = () => {
    const need = runtime.needBytes;
    if (need === undefined || need <= LOCAL_MODEL_ASK_BYTES) return void sendWake(false);
    Alert.alert(
      "Wake a local model",
      `${model.name} takes ${formatGb(need)} and leaves ${formatGb(Math.max(0, props.availableBytes - need))} free.`,
      [
        { text: "Decline", style: "cancel" },
        { text: "Approve", onPress: () => void sendWake(true) },
      ],
    );
  };

  return (
    <View
      className={
        props.first
          ? "flex-row items-center gap-3 p-4"
          : "border-t border-border flex-row items-center gap-3 p-4"
      }
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-control-medium text-base text-foreground" numberOfLines={1}>
          {model.name}
        </Text>
        <Text className="text-sm tabular-nums text-foreground-muted" numberOfLines={1}>
          {`${status.state}${status.rest}`}
        </Text>
        {(refusal ?? status.second) === null ? null : (
          <Text
            className={
              refusal === null ? "text-xs text-foreground-muted" : "text-xs text-danger-foreground"
            }
            numberOfLines={1}
          >
            {refusal ?? status.second}
          </Text>
        )}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => (asleep ? onWake() : void sleep({ environmentId, input: { id: model.id } }))}
        className="rounded-full bg-subtle px-3 py-2 active:opacity-70"
      >
        <Text className="font-control-medium text-sm text-foreground">
          {asleep ? "Wake" : "Sleep"}
        </Text>
      </Pressable>
    </View>
  );
}
