import { createFileRoute } from "@tanstack/react-router";

import { MenubarPanel } from "../components/menubar/MenubarPanel";

/** The desktop app's menu-bar panel, in its own window (design/hybrid/HANDOFF.md §19). */
export const Route = createFileRoute("/menubar")({
  component: MenubarPanel,
});
