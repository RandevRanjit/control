import type { DesktopSavedLogin } from "@control/contracts";
import { MoreVertical, Plus as PlusIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { formatRelativeTimeLabel } from "~/timestampFormat";
import { cn } from "~/lib/utils";

import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { toastManager } from "../ui/toast";
import { LoginDialog } from "./LoginDialog";
import { loginsBridge } from "./loginsBridge";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

/** The logins the desktop app's browser signs in with. No password ever reaches this page. */
export function LoginsSetting({ disabled }: { readonly disabled: boolean }) {
  const [logins, setLogins] = useState<readonly DesktopSavedLogin[]>([]);
  const [unreadable, setUnreadable] = useState(false);
  const [editing, setEditing] = useState<DesktopSavedLogin | "new" | null>(null);

  const load = useCallback(() => {
    void loginsBridge?.list().then(
      (next) => {
        setLogins(next);
        setUnreadable(false);
      },
      () => setUnreadable(true),
    );
  }, []);

  // A sign-in elsewhere can use a login or be turned down while this page is open.
  useEffect(() => {
    if (!loginsBridge) return;
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [load]);

  const change = (operation: Promise<void>) => {
    void operation.then(load, () => {
      toastManager.add({ type: "error", title: "Could not change this login" });
      load();
    });
  };

  return (
    <SettingsRow
      {...searchableSetting("saved-logins")}
      description="Signs in for you and your agents on the site each login is for. Passwords are encrypted with your Keychain."
      control={
        <Button
          size="sm"
          variant="outline"
          disabled={disabled || !loginsBridge}
          onClick={() => setEditing("new")}
        >
          <PlusIcon />
          Add
        </Button>
      }
    >
      {unreadable ? (
        <p role="alert" className="mt-2 mb-2 text-sm text-destructive">
          Saved logins can&rsquo;t be read, so none is used.
        </p>
      ) : null}
      {logins.length > 0 ? (
        <div className="mt-2 mb-2 overflow-hidden rounded-lg border border-border/60">
          {logins.map((login, index) => {
            const site = new URL(login.origin).host;
            return (
              <div
                key={login.origin}
                className={cn(
                  "flex items-center gap-3 px-3 py-2",
                  index > 0 && "border-t border-border/60",
                )}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-sm text-foreground">{site}</span>
                  <span className="truncate text-sm text-muted-foreground">{login.username}</span>
                </span>
                {login.refusedAt ? (
                  <Badge variant="warning">Turned down</Badge>
                ) : login.lastUsedAt ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    Used {formatRelativeTimeLabel(login.lastUsedAt)}
                  </span>
                ) : null}
                <Menu>
                  <MenuTrigger
                    render={
                      <Button size="icon-xs" variant="ghost-muted" aria-label={`${site} options`} />
                    }
                  >
                    <MoreVertical />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    {login.refusedAt ? (
                      <MenuItem onClick={() => change(loginsBridge!.retry(login.origin))}>
                        Retry
                      </MenuItem>
                    ) : null}
                    <MenuItem onClick={() => setEditing(login)}>Update</MenuItem>
                    <MenuItem
                      variant="destructive"
                      onClick={() => change(loginsBridge!.remove(login.origin))}
                    >
                      Remove
                    </MenuItem>
                  </MenuPopup>
                </Menu>
              </div>
            );
          })}
        </div>
      ) : null}
      {editing ? (
        <LoginDialog
          {...(editing === "new" ? {} : { site: editing.origin, username: editing.username })}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      ) : null}
    </SettingsRow>
  );
}
