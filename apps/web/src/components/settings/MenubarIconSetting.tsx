import { useState } from "react";

import { Switch } from "../ui/switch";
import { SettingsRow } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

/** Settings › General's Menu bar icon (design/hybrid/HANDOFF.md §19.4): the desktop app on the Mac only. */
export function MenubarIconSetting() {
  const menubar = window.desktopBridge?.menubar;
  const [enabled, setEnabled] = useState(() => menubar?.getEnabled() ?? false);
  const [isUpdating, setIsUpdating] = useState(false);
  if (!menubar) return null;

  const toggle = async (next: boolean) => {
    setIsUpdating(true);
    try {
      await menubar.setEnabled(next);
      setEnabled(next);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <SettingsRow
      {...searchableSetting("menu-bar-icon")}
      description="CONTROL's state in the menu bar, with the panel under it. On the Mac only."
      control={
        <Switch
          checked={enabled}
          disabled={isUpdating}
          onCheckedChange={(checked) => void toggle(checked)}
          aria-label="Menu bar icon"
        />
      }
    />
  );
}
