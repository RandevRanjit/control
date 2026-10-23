# Web UI

## Primitives

Controls come from [`components/ui`](../../apps/web/src/components/ui). Pick a `variant` or `size`;
never restyle one with `className` (`shadcn/no-restyle` fails lint). If none fits and the look is a
generic concept, add a variant to the component. Layout classes (width, flex, margin, position)
belong on the parent.

Don't style a raw `<button>`, `<input>`, `<select>`, or `<textarea>` to look like a control a
primitive provides. Raw elements are right when the element isn't that control: semantic rows, tabs,
resize handles, swatches, editor surfaces, anything whose behavior or geometry differs by design.

## Styles

The design draws most of the app. Its source of truth is [`design/hybrid/`](../../design/hybrid):
`v1.2/` for how it looks, `HANDOFF.md` for the spec.

- Design surfaces use the design's own classes from
  [`control-v1.css`](../../apps/web/src/control/control-v1.css) and
  [`tokens.css`](../../apps/web/src/control/tokens.css), which `index.css` imports as
  `@layer control`. Both are straight ports of the design; never hand-edit them.
- Design classes go on plain elements, never on a `components/ui` export.
- Where the app's markup differs from the design's (extra wrappers, list rows), add a small scoped
  override in [`index.css`](../../apps/web/src/index.css) with a comment saying why.
- Tailwind covers what the design doesn't draw: hover, focus rings, drag states, layout glue, and
  screens with no design yet. There, style with Tailwind classes in the component that renders the
  element.
- Other global CSS is only for what classes on the owning component can't express: generated Markdown or imperative DOM, custom
  elements and shadow roots, animations, runtime theme variables, and browser or Electron
  integration.
- No `style={{ ... }}` or inline `<style>` for static values a class covers. Values computed at
  runtime are fine.
- Theme-only rules use `@variant dark` and `@variant light`, not `.dark` selectors.

## Composition

The composer banners are the reference.

- [`ComposerBanner.tsx`](../../apps/web/src/components/chat/ComposerBanner.tsx) exports one object
  of small slots. Slots own their classes, take `className`, and spread the rest of their props,
  merging classes with `cn`. Variants and density are props on `Root`. A slot that needs a control
  renders `Button`.
- [`ComposerBannerStack.tsx`](../../apps/web/src/components/chat/ComposerBannerStack.tsx) composes
  the slots and owns only stack behavior: priority, expand and collapse, dismiss transitions.
- Consumers are a few lines of slots, and the slots carry the styling:
  [`ComposerActivityStatus.tsx`](../../apps/web/src/components/chat/ComposerActivityStatus.tsx).

Build new UI the same way. Compose or extend a component instead of copying its markup and classes.
When a call site repeats a treatment another one already uses, make it a variant or a slot on the
shared component. A new composer banner or notice uses the `ComposerBanner` slots.
