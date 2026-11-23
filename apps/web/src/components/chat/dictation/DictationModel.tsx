import type { EnvironmentId, VoiceModelState } from "@control/contracts";
import { useAtomValue } from "@effect/atom-react";

import { useAtomCommand } from "../../../state/use-atom-command";
import { voiceEnvironment } from "../../../state/voice";

const megabytes = (bytes: number) => Math.round(bytes / 1_000_000);

/** What dictation's model is doing, with the one thing to do about it. */
export function DictationModel(props: {
  readonly environmentId: EnvironmentId;
  readonly model: VoiceModelState;
}) {
  const { environmentId, model } = props;
  const canChange = useAtomValue(voiceEnvironment.install.permissionAtom(environmentId));
  const install = useAtomCommand(voiceEnvironment.install, "Download dictation");
  const remove = useAtomCommand(voiceEnvironment.remove, "Remove dictation");
  const target = { environmentId, input: {} };
  const total = megabytes(model.sizeBytes);
  const received = megabytes(model.receivedBytes ?? 0);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex min-h-7 items-center gap-3">
        <span className="min-w-0 flex-1 text-sm tabular-nums" role="status">
          {model.status === "ready"
            ? `On this Mac, ${total} MB`
            : model.status === "downloading"
              ? `${received} of ${total} MB`
              : model.status === "missing"
                ? `${total} MB to download`
                : "Needs a Mac with Apple silicon"}
        </span>
        {!canChange || model.status === "unsupported" ? null : model.status === "missing" ? (
          <button type="button" className="pill sm" onClick={() => void install(target)}>
            Download
          </button>
        ) : (
          <button type="button" className="pill ghost sm" onClick={() => void remove(target)}>
            {model.status === "downloading" ? "Stop" : "Remove"}
          </button>
        )}
      </div>
      {model.status === "downloading" ? (
        <div
          role="progressbar"
          aria-label="Download"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={received}
          className="h-1 overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-foreground transition-[width] duration-300"
            style={{ width: `${((model.receivedBytes ?? 0) / model.sizeBytes) * 100}%` }}
          />
        </div>
      ) : null}
      {model.error ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          {model.error}
        </p>
      ) : null}
    </div>
  );
}
