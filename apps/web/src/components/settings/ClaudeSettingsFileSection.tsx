import {
  ClaudeEffortLevel,
  ClaudePermissionMode,
  type ClaudeSettingsFilePatch,
} from "@control/contracts";
import { useEffect, useState } from "react";

import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { serverEnvironment } from "~/state/server";
import { useAtomCommand } from "~/state/use-atom-command";
import { Input } from "../ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { formatEnvText, hookSummary, parseEnvText } from "./claudeSettingsFile.logic";
import { SettingsRow, SettingsSection } from "./settingsLayout";

const UNSET = "unset";

/** A text field that writes on blur or Enter, so the file is not rewritten per keystroke. */
function CommitInput(props: {
  readonly value: string;
  readonly placeholder: string;
  readonly onCommit: (value: string) => void;
  readonly "aria-label": string;
}) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  const commit = () => {
    if (draft.trim() !== props.value) props.onCommit(draft.trim());
  };
  return (
    <Input
      size="sm"
      className="w-full sm:w-56"
      value={draft}
      placeholder={props.placeholder}
      aria-label={props["aria-label"]}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

function LiteralSelect(props: {
  readonly value: string | null;
  readonly options: ReadonlyArray<string>;
  readonly onChange: (value: string | null) => void;
  readonly "aria-label": string;
}) {
  return (
    <Select
      value={props.value ?? UNSET}
      onValueChange={(value) => props.onChange(value === UNSET ? null : value)}
    >
      <SelectTrigger size="sm" className="w-full sm:w-40" aria-label={props["aria-label"]}>
        <SelectValue>{props.value ?? "CLI default"}</SelectValue>
      </SelectTrigger>
      <SelectPopup align="end" alignItemWithTrigger={false}>
        <SelectItem hideIndicator value={UNSET}>
          CLI default
        </SelectItem>
        {props.options.map((option) => (
          <SelectItem hideIndicator key={option} value={option}>
            {option}
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
  );
}

/**
 * CONTROL's front-end for `~/.claude/settings.json` (HANDOFF-v2 §4.1): each
 * row reads and writes that file, so the plain CLI sees the same settings.
 */
export function ClaudeSettingsFileSection() {
  const environmentId = usePrimaryEnvironmentId();
  const query = useEnvironmentQuery(
    environmentId === null
      ? null
      : serverEnvironment.claudeSettingsFile({ environmentId, input: {} }),
  );
  const update = useAtomCommand(serverEnvironment.updateClaudeSettingsFile);
  const file = query.data;
  const [envDraft, setEnvDraft] = useState("");
  useEffect(() => setEnvDraft(file === null ? "" : formatEnvText(file.env)), [file]);
  if (environmentId === null) return null;

  const save = async (patch: ClaudeSettingsFilePatch) => {
    await update({ environmentId, input: patch });
    query.refresh();
  };

  return (
    <SettingsSection id="claude-code" title="Claude Code">
      {file === null ? (
        <SettingsRow title="settings.json" description={query.error ?? "Reading…"} />
      ) : (
        <>
          <SettingsRow
            title="Model"
            description={`Read from and written to ${file.path}.`}
            control={
              <CommitInput
                value={file.model ?? ""}
                placeholder="CLI default"
                onCommit={(model) => void save({ model: model === "" ? null : model })}
                aria-label="Claude model"
              />
            }
          />
          <SettingsRow
            title="Effort"
            control={
              <LiteralSelect
                value={file.effortLevel}
                options={ClaudeEffortLevel.literals}
                onChange={(value) =>
                  void save({ effortLevel: value as ClaudeSettingsFilePatch["effortLevel"] })
                }
                aria-label="Claude effort"
              />
            }
          />
          <SettingsRow
            title="Permission mode"
            control={
              <LiteralSelect
                value={file.defaultMode}
                options={ClaudePermissionMode.literals}
                onChange={(value) =>
                  void save({ defaultMode: value as ClaudeSettingsFilePatch["defaultMode"] })
                }
                aria-label="Claude permission mode"
              />
            }
          />
          <SettingsRow
            title="Memory folder"
            control={
              <CommitInput
                value={file.autoMemoryDirectory ?? ""}
                placeholder="CLI default"
                onCommit={(folder) =>
                  void save({ autoMemoryDirectory: folder === "" ? null : folder })
                }
                aria-label="Claude memory folder"
              />
            }
          />
          <SettingsRow title="Environment" description="One KEY=value per line; saved on blur.">
            <Textarea
              className="mt-2 font-mono text-xs"
              value={envDraft}
              aria-label="Claude environment variables"
              onChange={(event) => setEnvDraft(event.target.value)}
              onBlur={() => {
                if (envDraft !== formatEnvText(file.env))
                  void save({ env: parseEnvText(envDraft) });
              }}
            />
          </SettingsRow>
          {Object.entries(file.enabledPlugins).map(([plugin, enabled]) => (
            <SettingsRow
              key={plugin}
              title={plugin}
              description="Plugin"
              control={
                <Switch
                  checked={enabled}
                  onCheckedChange={(checked) =>
                    void save({ enabledPlugins: { [plugin]: Boolean(checked) } })
                  }
                  aria-label={`Plugin ${plugin}`}
                />
              }
            />
          ))}
          <SettingsRow title="Hooks" description={hookSummary(file.hookEvents)} />
        </>
      )}
    </SettingsSection>
  );
}
