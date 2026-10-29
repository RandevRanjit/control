import { createContext } from "react";

/**
 * The right end of the panel's chip row. A view whose tools belong beside its chips (the
 * terminal's split, new and close; design §5.6) portals them here. Null outside the panel.
 */
export const RightPanelToolsSlot = createContext<HTMLElement | null>(null);
