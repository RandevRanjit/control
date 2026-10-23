import { gbOne } from "@control/client-runtime/localModels";
import type {
  EnvironmentId,
  LocalModel,
  LocalModelCandidate,
  LocalModelId,
} from "@control/contracts";
import { useEffect, useState } from "react";

import { localModelsEnvironment } from "../../state/localModels";
import { useAtomCommand } from "../../state/use-atom-command";
import { Dialog, DialogPopup } from "../ui/dialog";
import { DEFAULT_IDLE_MINUTES, DEFAULT_SYSTEM_PROMPT, homeRelative } from "./localModels.logic";

/**
 * Add (design/hybrid/HANDOFF.md §18.6, M3): the GGUFs in ~/models and the Hugging Face cache
 * that aren't added yet, each with its command filled in. Browse, on the desktop, adds any
 * other file.
 */
export function LocalModelAddSheet(props: {
  readonly environmentId: EnvironmentId;
  readonly registered: ReadonlyArray<LocalModel>;
  readonly onClose: () => void;
  readonly onAdded: (id: LocalModelId) => void;
}) {
  const { environmentId } = props;
  const scan = useAtomCommand(localModelsEnvironment.scan);
  const register = useAtomCommand(localModelsEnvironment.register);
  const [found, setFound] = useState<ReadonlyArray<LocalModelCandidate> | null>(null);
  const pickModelFile = window.desktopBridge?.pickModelFile;

  useEffect(() => {
    void scan({ environmentId, input: {} }).then((result) =>
      setFound(result._tag === "Success" ? result.value : []),
    );
  }, [environmentId, scan]);

  const add = async (candidate: LocalModelCandidate) => {
    const result = await register({
      environmentId,
      input: {
        name: candidate.name,
        file: candidate.file,
        ...(candidate.projector === undefined ? {} : { projector: candidate.projector }),
        args: candidate.args,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        idleMinutes: DEFAULT_IDLE_MINUTES,
      },
    });
    if (result._tag === "Success") props.onAdded(result.value.id);
  };

  const browse = async () => {
    const file = await pickModelFile?.();
    if (!file) return;
    const result = await scan({ environmentId, input: { file } });
    const candidate = result._tag === "Success" ? result.value[0] : undefined;
    if (candidate !== undefined) await add(candidate);
  };

  const fresh = found?.filter((candidate) =>
    props.registered.every((model) => model.file !== candidate.file),
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
    >
      <DialogPopup
        variant="bare"
        showCloseButton={false}
        bottomStickOnMobile={false}
        aria-label="Add a local model"
      >
        <div className="s-lm-root">
          <div className="panel float s-lm-add">
            <p className="s-lm-aq">Add a local model</p>
            <p className="s-lm-as">
              {fresh !== undefined && fresh.length === 0 ? (
                <>
                  No new GGUF files in <code>~/models</code> or the Hugging Face cache.
                </>
              ) : (
                <>
                  GGUF files in <code>~/models</code> and the Hugging Face cache.
                </>
              )}
            </p>
            {fresh === undefined || fresh.length === 0 ? null : (
              <div className="s-lm-found">
                {fresh.map((candidate) => {
                  const slash = candidate.file.lastIndexOf("/");
                  return (
                    <div key={candidate.file} className="s-lm-f">
                      <span className="s-lm-fn">{candidate.file.slice(slash + 1)}</span>
                      <span className="s-lm-fd">
                        {homeRelative(candidate.file.slice(0, slash))}
                        {candidate.projector === undefined ? "" : " · vision"}
                      </span>
                      <span className="s-lm-fz">{gbOne(candidate.sizeBytes)}</span>
                      <button type="button" className="pill sm" onClick={() => void add(candidate)}>
                        Add
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="s-lm-af">
              {pickModelFile === undefined ? null : (
                <button type="button" className="pill ghost" onClick={() => void browse()}>
                  Browse
                </button>
              )}
              <span className="sp" />
              <button type="button" className="pill ghost" onClick={props.onClose}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      </DialogPopup>
    </Dialog>
  );
}
