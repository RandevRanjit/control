import { awakeModels, noteFace } from "@control/client-runtime/localModels";
import { useNavigate } from "@tanstack/react-router";

import { localModelsEnvironment, useLocalModels, useSecondTick } from "../../state/localModels";
import { useAtomCommand } from "../../state/use-atom-command";
import { Lamp } from "../control/bloom";

/**
 * One note per awake model under the update note (design/hybrid/HANDOFF.md §18.5, M1): its
 * lamp, its name, what it's doing, and Sleep, which also stops a load. The name opens
 * Settings › Local models.
 */
export function SidebarLocalModelNotes() {
  const navigate = useNavigate();
  const { environmentId, snapshot } = useLocalModels();
  const sleep = useAtomCommand(localModelsEnvironment.sleep);
  const awake = snapshot === null ? [] : awakeModels(snapshot);
  const nowMs = useSecondTick(awake.some(({ runtime }) => runtime.state === "waking"));
  if (environmentId === null || awake.length === 0) return null;
  return (
    <div className="s-lm-root">
      {awake.map(({ model, runtime }) => {
        const face = noteFace(runtime, nowMs);
        return (
          <div key={model.id} className="hy-upd s-lm-note">
            <Lamp st={face.lamp} />
            <b>
              <button type="button" onClick={() => void navigate({ to: "/settings/local-models" })}>
                {model.name}
              </button>
            </b>
            <span className="s-lm-st">
              {face.before}
              {face.num === "" ? null : <span className="t-num">{face.num}</span>}
              {face.after}
            </span>
            <button
              type="button"
              className="pill sm"
              onClick={() => void sleep({ environmentId, input: { id: model.id } })}
            >
              Sleep
            </button>
          </div>
        );
      })}
    </div>
  );
}
