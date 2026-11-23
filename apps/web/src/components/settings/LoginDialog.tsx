import { loginOrigin } from "@control/shared/preview";
import { useState } from "react";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { loginsBridge } from "./loginsBridge";

/**
 * Saves a website login to the desktop app. `site` fixes the address it is for; mount it with a
 * `key` so each opening starts empty. A saved password is never shown again.
 */
export function LoginDialog({
  site,
  username: savedUsername,
  onClose,
  onSaved,
}: {
  readonly site?: string | undefined;
  readonly username?: string | undefined;
  readonly onClose: () => void;
  readonly onSaved?: (() => void) | undefined;
}) {
  const [typedSite, setTypedSite] = useState("");
  const [username, setUsername] = useState(savedUsername ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const origin = loginOrigin(site ?? typedSite);
  const canSave = origin !== null && username.trim() !== "" && password !== "" && !saving;

  const save = async () => {
    if (!canSave || !loginsBridge) return;
    setSaving(true);
    setError(null);
    try {
      await loginsBridge.save({ site: origin, username: username.trim(), password });
      onSaved?.();
      onClose();
    } catch {
      setError(
        "This login wasn't saved. Check that Control may use your Keychain, then try again.",
      );
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{savedUsername === undefined ? "Save login" : "Update login"}</DialogTitle>
          <DialogDescription>
            The browser signs in with it on this site, in your tabs and your agents&rsquo;. The
            password is encrypted with your Keychain.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel>
          <form
            id="saved-login"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="saved-login-site">Site</Label>
              <Input
                id="saved-login-site"
                placeholder="login.example.com"
                autoComplete="off"
                spellCheck={false}
                disabled={site !== undefined}
                value={site === undefined ? typedSite : (origin ?? site)}
                onChange={(event) => setTypedSite(event.target.value)}
                autoFocus={site === undefined}
              />
              {site === undefined ? (
                <p className="text-xs text-muted-foreground">
                  The address of the sign-in page itself, which can differ from the site&rsquo;s.
                </p>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="saved-login-username">Username</Label>
              <Input
                id="saved-login-username"
                autoComplete="off"
                spellCheck={false}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoFocus={site !== undefined && savedUsername === undefined}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="saved-login-password">Password</Label>
              <Input
                id="saved-login-password"
                type="password"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoFocus={savedUsername !== undefined}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </form>
        </DialogPanel>
        <DialogFooter variant="bare">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="saved-login" disabled={!canSave}>
            Save
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
