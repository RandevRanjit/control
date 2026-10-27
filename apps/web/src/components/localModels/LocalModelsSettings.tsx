import { gbOne, memoryBar, rowLamp, rowStatus } from "@control/client-runtime/localModels";
import { squashAtomCommandFailure } from "@control/client-runtime/state/runtime";
import {
  type EnvironmentId,
  formatGb,
  LOCAL_MODEL_ASK_BYTES,
  type LocalModel,
  type LocalModelId,
  type LocalModelRuntime,
  type LocalModelsSnapshot,
} from "@control/contracts";
import { useAtomValue } from "@effect/atom-react";
import { useState } from "react";

import { localModelsEnvironment, useLocalModels, useSecondTick } from "../../state/localModels";
import { useAtomCommand } from "../../state/use-atom-command";
import { Lamp } from "../control/bloom";
import { Switch } from "../ui/switch";
import { SettingsPageContainer, useSettingsSearchTarget } from "../settings/settingsLayout";
import { LocalModelAddSheet } from "./LocalModelAddSheet";
import { commandText, homeRelative, parseCommand } from "./localModels.logic";

/** A failed wake's message, which for a refusal is its numbers. */
const failureMessage = (result: Parameters<typeof squashAtomCommandFailure>[0]) => {
  const error = squashAtomCommandFailure(result);
  return error instanceof Error ? error.message : "Couldn't wake it.";
};

/**
 * Settings › Local models (design/hybrid/HANDOFF.md §18.6, M2): the Mac's memory, every model
 * with what it's doing, and the selected model's settings. Adding and editing are the
 * desktop's; any client can wake and sleep.
 */
export function LocalModelsSettings() {
  const { environmentId, snapshot } = useLocalModels();
  const canEdit = useAtomValue(localModelsEnvironment.register.permissionAtom(environmentId));
  const [selected, setSelected] = useState<LocalModelId | null>(null);
  const [adding, setAdding] = useState(false);
  const targetRef = useSettingsSearchTarget<HTMLDivElement>("local-models");
  const nowMs = useSecondTick(
    snapshot?.runtimes.some((runtime) => runtime.state === "waking") ?? false,
  );

  return (
    <SettingsPageContainer>
      <div className="s-lm-root">
        <div
          ref={targetRef}
          id="local-models"
          className="panel s-lm-set"
          role="region"
          aria-label="Local models"
        >
          <div className="s-lm-sh">
            <h4>Local models</h4>
            <span className="sp" />
            {canEdit && environmentId !== null ? (
              <button type="button" className="pill sm" onClick={() => setAdding(true)}>
                Add
              </button>
            ) : null}
          </div>
          <p className="s-lm-sd">
            Models that run on this Mac. You and your agents wake them; an agent hands one files by
            path, and only its answer comes back to Claude.
          </p>
          {snapshot === null ? null : <MemoryBar snapshot={snapshot} />}
          {snapshot === null || environmentId === null ? null : (
            <div className="s-lm-list">
              {snapshot.models.map((model) => (
                <ModelRow
                  key={model.id}
                  environmentId={environmentId}
                  model={model}
                  runtime={snapshot.runtimes.find((runtime) => runtime.modelId === model.id)}
                  availableBytes={snapshot.memory.availableBytes}
                  nowMs={nowMs}
                  open={selected === model.id}
                  canEdit={canEdit}
                  onToggle={() => setSelected(selected === model.id ? null : model.id)}
                  onRemoved={() => setSelected(null)}
                />
              ))}
            </div>
          )}
          <p className="s-lm-rules">
            Anything over 40 GB asks before it wakes. A wake is refused if it would leave less than
            15 GB free, or if the Mac is using swap. Quitting CONTROL puts every model to sleep, and
            after a crash CONTROL kills the models it started, and only those.
          </p>
        </div>
        {adding && environmentId !== null && snapshot !== null ? (
          <LocalModelAddSheet
            environmentId={environmentId}
            registered={snapshot.models}
            onClose={() => setAdding(false)}
            onAdded={(id) => {
              setAdding(false);
              setSelected(id);
            }}
          />
        ) : null}
      </div>
    </SettingsPageContainer>
  );
}

/** Other apps, the models, what's free and the 15 GB kept back, with the swap at the end. */
function MemoryBar(props: { readonly snapshot: LocalModelsSnapshot }) {
  const bar = memoryBar(props.snapshot);
  const pct = (bytes: number) => `${((bytes / bar.total) * 100).toFixed(2)}%`;
  return (
    <div className="s-lm-mem">
      <div className="s-lm-mh">
        Memory<span className="t-num">{formatGb(bar.total)}</span>
        <span className="s-lm-soft">on this Mac</span>
      </div>
      <div className="s-lm-bar">
        <i data-k="apps" style={{ width: pct(bar.apps) }} />
        <i data-k="models" style={{ width: pct(bar.models) }} />
        <span className="s-lm-keep" style={{ left: pct(bar.total - bar.keep) }} />
      </div>
      <div className="s-lm-leg">
        <span>
          <i data-k="apps" />
          Apps <b>{gbOne(bar.apps)}</b>
        </span>
        <span>
          <i data-k="models" />
          Models <b>{gbOne(bar.models)}</b>
        </span>
        <span>
          <i data-k="free" />
          Free <b>{gbOne(bar.free)}</b>
        </span>
        <span>
          <i data-k="keep" />
          Kept back <b>{gbOne(bar.keep)}</b>
        </span>
        <span>
          Swap <b>{gbOne(bar.swap)}</b>
        </span>
      </div>
    </div>
  );
}

const ASLEEP = (model: LocalModel): LocalModelRuntime => ({
  modelId: model.id,
  state: "asleep",
  since: new Date(0).toISOString(),
  calls: 0,
});

function ModelRow(props: {
  readonly environmentId: EnvironmentId;
  readonly model: LocalModel;
  readonly runtime: LocalModelRuntime | undefined;
  readonly availableBytes: number;
  readonly nowMs: number;
  readonly open: boolean;
  readonly canEdit: boolean;
  readonly onToggle: () => void;
  readonly onRemoved: () => void;
}) {
  const { environmentId, model } = props;
  const runtime = props.runtime ?? ASLEEP(model);
  const wake = useAtomCommand(localModelsEnvironment.wake, { reportFailure: false });
  const sleep = useAtomCommand(localModelsEnvironment.sleep);
  // Over 40 GB, Wake asks in place first, as the chat does (§18.3).
  const [asking, setAsking] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const status = rowStatus(runtime, props.nowMs);
  const need = runtime.needBytes;
  const asleep = runtime.state === "asleep";

  const onWake = async () => {
    if (!asking && need !== undefined && need > LOCAL_MODEL_ASK_BYTES) {
      setAsking(true);
      return;
    }
    setAsking(false);
    setRefusal(null);
    const result = await wake({
      environmentId,
      input: { id: model.id, ...(asking ? { approved: true } : {}) },
    });
    if (result._tag === "Failure") setRefusal(failureMessage(result));
  };

  const second =
    refusal ??
    (asking && need !== undefined
      ? `takes ${formatGb(need)} · leaves ${formatGb(Math.max(0, props.availableBytes - need))} free`
      : status.second);

  return (
    <>
      <div className="s-lm-row" data-on={props.open ? "" : undefined}>
        <Lamp st={rowLamp(props.runtime)} />
        <button type="button" aria-expanded={props.open} onClick={props.onToggle}>
          <div className="s-lm-nm">{model.name}</div>
          <div className="s-lm-fl">{homeRelative(model.file)}</div>
        </button>
        <div className="s-lm-rs">
          {asleep ? status.state : <b>{status.state}</b>}
          {status.rest}
          {second === null ? null : <span className="s-lm-pid">{second}</span>}
        </div>
        <button
          type="button"
          className="pill sm"
          onClick={() =>
            asleep ? void onWake() : void sleep({ environmentId, input: { id: model.id } })
          }
        >
          {asleep ? (asking ? "Approve" : "Wake") : "Sleep"}
        </button>
      </div>
      {props.open ? (
        <ModelEditor
          key={model.id}
          environmentId={environmentId}
          model={model}
          canEdit={props.canEdit}
          onRemoved={props.onRemoved}
        />
      ) : null}
    </>
  );
}

/** Changes save as each field is left, and apply at the model's next wake. */
function ModelEditor(props: {
  readonly environmentId: EnvironmentId;
  readonly model: LocalModel;
  readonly canEdit: boolean;
  readonly onRemoved: () => void;
}) {
  const { environmentId, model } = props;
  const update = useAtomCommand(localModelsEnvironment.update);
  const remove = useAtomCommand(localModelsEnvironment.remove);
  const [name, setName] = useState(model.name);
  const [command, setCommand] = useState(() => commandText(model.args, model));
  const [systemPrompt, setSystemPrompt] = useState(model.systemPrompt);
  const [idle, setIdle] = useState(String(model.idleMinutes));
  const args = parseCommand(command, model);
  const idleMinutes = /^\d+$/.test(idle.trim()) ? Number(idle.trim()) : 0;

  const save = (chat = model.chat) => {
    if (name.trim() === "" || args === null || idleMinutes < 1) return;
    if (
      name.trim() === model.name &&
      JSON.stringify(args) === JSON.stringify(model.args) &&
      systemPrompt === model.systemPrompt &&
      idleMinutes === model.idleMinutes &&
      chat === model.chat
    ) {
      return;
    }
    void update({
      environmentId,
      input: {
        id: model.id,
        name: name.trim(),
        file: model.file,
        ...(model.projector === undefined ? {} : { projector: model.projector }),
        args,
        systemPrompt,
        idleMinutes,
        ...(chat === undefined ? {} : { chat }),
      },
    });
  };
  const field = { readOnly: !props.canEdit, onBlur: () => save() };

  return (
    <div className="s-lm-ed">
      <span className="s-lm-lb">Name</span>
      <div>
        <input
          className="input s-lm-in"
          aria-label="Name"
          aria-invalid={name.trim() === "" || undefined}
          value={name}
          onChange={(event) => setName(event.target.value)}
          {...field}
        />
      </div>
      <span className="s-lm-lb">File</span>
      <div>
        <div className="s-lm-val">{model.file.split("/").at(-1)}</div>
        {model.projector === undefined ? null : (
          <div className="s-lm-hint">With its vision projector beside it.</div>
        )}
      </div>
      <span className="s-lm-lb">Command</span>
      <div>
        <textarea
          className="s-lm-cmd"
          aria-label="Command"
          aria-invalid={args === null || undefined}
          spellCheck={false}
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          {...field}
        />
        <div className="s-lm-hint">
          {args === null
            ? "A quote is left open."
            : "CONTROL sets the host and port, so it listens on this Mac only."}
        </div>
      </div>
      <span className="s-lm-lb">System prompt</span>
      <div>
        <textarea
          className="s-lm-sys"
          aria-label="System prompt"
          value={systemPrompt}
          onChange={(event) => setSystemPrompt(event.target.value)}
          {...field}
        />
        <div className="s-lm-hint">Read once at every wake, so each call starts warm.</div>
      </div>
      <span className="s-lm-lb">Sleeps after</span>
      <div>
        <label className="input s-lm-in s-lm-short">
          <input
            aria-label="Sleeps after, in minutes"
            aria-invalid={idleMinutes < 1 || undefined}
            inputMode="numeric"
            value={idle}
            onChange={(event) => setIdle(event.target.value)}
            {...field}
          />
          <span className="s-lm-u">min</span>
        </label>
        <div className="s-lm-hint">idle, with no call running.</div>
      </div>
      <span className="s-lm-lb">Threads</span>
      <div>
        <Switch
          checked={model.chat === true}
          disabled={!props.canEdit}
          onCheckedChange={(checked) => save(checked)}
          aria-label="Offer in threads"
        />
        <div className="s-lm-hint">
          In the model picker, where Claude Code runs on this model. Off for a model built for one
          job.
        </div>
      </div>
      <span className="s-lm-lb">Memory</span>
      <div>
        <div className="s-lm-val">
          {model.measuredBytes === undefined ? "Not measured yet" : gbOne(model.measuredBytes)}
        </div>
        <div className="s-lm-hint">
          Measured at its last wake. Before the first, CONTROL estimates it from the files.
        </div>
      </div>
      <div className="s-lm-edf">
        <span className="s-lm-hint">Changes apply at its next wake.</span>
        {props.canEdit ? (
          <button
            type="button"
            className="pill ghost sm"
            onClick={async () => {
              const result = await remove({ environmentId, input: { id: model.id } });
              if (result._tag === "Success") props.onRemoved();
            }}
          >
            Remove
          </button>
        ) : null}
      </div>
    </div>
  );
}
