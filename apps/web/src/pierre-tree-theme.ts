import type { CSSProperties } from "react";

/** Shadow-root overrides that make a Pierre file tree read as part of the app chrome. */
export const PIERRE_TREE_UNSAFE_CSS = `
  :host {
    --trees-bg-override: transparent;
    --trees-selected-bg-override: color-mix(in srgb, currentColor 12%, transparent);
    --trees-hover-bg-override: color-mix(in srgb, currentColor 7%, transparent);
    --trees-border-color-override: color-mix(in srgb, currentColor 14%, transparent);
    --trees-font-family-override: var(--font-sans);
    --trees-font-size-override: 0.75rem;
    /* Git's letters take Diff's inks (design §5.4): M and R in the write green, A in the read blue. */
    --trees-git-modified-color-override: var(--tv-write);
    --trees-git-renamed-color-override: var(--tv-write);
    --trees-git-added-color-override: var(--tv-read);
    /* Ignored rows dim to the caption ink, still readable on Field's pale ground. */
    --trees-git-ignored-color-override: var(--text-caption);
    --trees-focus-ring-color-override: var(--focus);
  }
  /* A clicked row shows as picked by its tone; the ring is for the keyboard. */
  button[data-type='item'][data-item-focused='true']:not(:focus-visible)::before { outline: none; }
  /* A changed folder's dot in the full write green, as its files' M. */
  [data-item-contains-git-change='true'] > [data-item-section='git'] { opacity: 1; }
  button[data-type='item'] { border-radius: 5px; }
  svg[data-icon-name='control-tree-icon-loading'] { opacity: 0.6; }
  @media (prefers-reduced-motion: no-preference) {
    svg[data-icon-name='control-tree-icon-loading'] { animation: control-tree-spin 1s linear infinite; }
  }
  @keyframes control-tree-spin { to { transform: rotate(360deg); } }
`;

/** Host styles that keep a Pierre tree on the active color scheme and foreground. */
export function pierreTreeStyle(colorScheme: "light" | "dark"): CSSProperties {
  return {
    colorScheme,
    ["--trees-fg-override" as string]: "var(--contrast-foreground)",
  };
}
