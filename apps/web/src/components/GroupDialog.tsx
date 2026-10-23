import { GroupTint } from "@control/contracts";
import { type CSSProperties, useEffect, useId, useState } from "react";
import { create } from "zustand";

import { cn } from "~/lib/utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const GROUP_TINTS: ReadonlyArray<GroupTint> = GroupTint.literals;

type GroupDetails = { readonly name: string; readonly tint: GroupTint };
type Request = {
  readonly initial: GroupDetails | null;
  readonly resolve: (details: GroupDetails | null) => void;
};
const useRequest = create<{ request: Request | null }>(() => ({ request: null }));

/** Ask for a group's name and tint; `initial` edits an existing group. */
export function requestGroupDetails(initial: GroupDetails | null): Promise<GroupDetails | null> {
  useRequest.getState().request?.resolve(null);
  return new Promise((resolve) => useRequest.setState({ request: { initial, resolve } }));
}

function finish(details: GroupDetails | null) {
  const request = useRequest.getState().request;
  useRequest.setState({ request: null });
  request?.resolve(details);
}

export function GroupDialogHost() {
  const request = useRequest((state) => state.request);
  useEffect(() => () => finish(null), []);
  return request ? <GroupDialog initial={request.initial} /> : null;
}

/** A pearl in a group's identity tint. */
export function GroupPearl(props: { readonly tint: GroupTint; readonly className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("pearl", props.className)}
      style={{ "--p": "12px", "--c": `var(--id-${props.tint})` } as CSSProperties}
    />
  );
}

function GroupDialog(props: { readonly initial: GroupDetails | null }) {
  const id = useId();
  const [name, setName] = useState(props.initial?.name ?? "");
  const [tint, setTint] = useState<GroupTint>(props.initial?.tint ?? "peri");
  const trimmed = name.trim();
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) finish(null);
      }}
    >
      <DialogPopup className="sm:max-w-sm">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed.length > 0) finish({ name: trimmed, tint });
          }}
        >
          <DialogHeader>
            <DialogTitle>{props.initial === null ? "New group" : "Edit group"}</DialogTitle>
          </DialogHeader>
          <DialogPanel className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${id}-name`}>Name</Label>
              <Input
                id={`${id}-name`}
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Tint</Label>
              <div className="flex justify-between">
                {GROUP_TINTS.map((candidate) => (
                  <button
                    key={candidate}
                    type="button"
                    aria-label={candidate}
                    aria-pressed={candidate === tint}
                    onClick={() => setTint(candidate)}
                    className={cn(
                      "flex size-8 cursor-pointer items-center justify-center rounded-full",
                      candidate === tint && "ring-2 ring-ring",
                    )}
                  >
                    <GroupPearl tint={candidate} className="size-5" />
                  </button>
                ))}
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={trimmed.length === 0}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
