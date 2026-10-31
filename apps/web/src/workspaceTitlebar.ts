// `titlebar-inset` also lets a title bar make room for an auto-hidden sidebar while it is out
// (index.css).
export const COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS =
  "titlebar-inset [[data-sidebar-state=collapsed]_&]:pl-[var(--workspace-titlebar-content-left)] max-md:[[data-sidebar-state=expanded]_&]:pl-[var(--workspace-titlebar-content-left)]";
