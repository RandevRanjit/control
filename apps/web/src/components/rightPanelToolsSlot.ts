import { createContext } from "react";

/**
 * The right end of the panel's chip row. A view whose tools belong beside its chips (the
 * terminal's split, new and close; design §5.6) portals them here. Null outside the panel.
 */
export const RightPanelToolsSlot = createContext<HTMLElement | null>(null);

/**
 * Where Folder's file view wants its tabs: over the file, beside the tree (design §5.4). The
 * view hands `attach` the element as a ref and the panel portals the chips into it; with no
 * tabs (`count` 0) the view leaves the row out. Null outside the panel.
 */
export const RightPanelChipsSlot = createContext<{
  readonly attach: (element: HTMLElement | null) => void;
  readonly count: number;
} | null>(null);
