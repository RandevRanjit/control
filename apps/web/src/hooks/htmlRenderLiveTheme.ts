import type { HtmlRenderFontFace, HtmlRenderTheme } from "@control/shared/htmlRender";

/**
 * Each render role and the page variable that draws it under Control's design tokens
 * (control-v1.css), so a render sits on the chat's own canvas in the reply's ink (§4.3). The
 * rest keep the theme palette's meaning: the page's `--accent` is a hover tone, the render's
 * is the brand accent.
 */
const LIVE_COLORS = [
  ["--background", "--background"],
  ["--foreground", "--text-strong"],
  ["--muted", "--muted"],
  ["--muted-foreground", "--muted-foreground"],
  ["--card", "--card"],
  ["--card-foreground", "--text-strong"],
  ["--popover", "--popover"],
  ["--popover-foreground", "--text-strong"],
  ["--border", "--border"],
  ["--input", "--input"],
  ["--code-background", "--code-background"],
  ["--code-foreground", "--code-foreground"],
] as const;

// What a var() the page doesn't define resolves to, so the palette's value stands.
const UNSET_COLOR = "rgb(1, 2, 3)";
const UNSET_FONT = "ControlUnsetFont";

/** One @font-face rule the page declares, as CSSOM reads it. */
interface DeclaredFontFace {
  readonly family: string;
  readonly src: string;
  readonly weight: string;
  readonly style: string;
  /** What the rule's relative URLs resolve against: its stylesheet, or the page. */
  readonly base: string;
}

const unquote = (name: string) => name.trim().replace(/^["']|["']$/g, "");

/** The faces a framed page needs for these font stacks, at URLs it can load. */
export function fontFacesForStacks(
  faces: ReadonlyArray<DeclaredFontFace>,
  stacks: ReadonlyArray<string>,
): HtmlRenderFontFace[] {
  const families = new Set(stacks.flatMap((stack) => stack.split(",").map(unquote)));
  return faces.flatMap((face) => {
    const family = unquote(face.family);
    const source =
      /url\(\s*["']?([^"')]+)["']?\s*\)(?:\s*format\(\s*["']?([^"')]+)["']?\s*\))?/.exec(face.src);
    if (!families.has(family) || source === null) return [];
    return [
      {
        family,
        url: new URL(source[1]!, face.base).href,
        ...(source[2] === undefined ? {} : { format: source[2] }),
        weight: face.weight,
        style: face.style,
      },
    ];
  });
}

function declaredFontFaces(): DeclaredFontFace[] {
  const faces: DeclaredFontFace[] = [];
  const visit = (rules: CSSRuleList, base: string) => {
    for (const rule of rules) {
      if (rule instanceof CSSFontFaceRule) {
        faces.push({
          family: rule.style.getPropertyValue("font-family"),
          src: rule.style.getPropertyValue("src"),
          weight: rule.style.getPropertyValue("font-weight") || "normal",
          style: rule.style.getPropertyValue("font-style") || "normal",
          base,
        });
      } else if ("cssRules" in rule) {
        visit((rule as CSSGroupingRule).cssRules, base);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      visit(sheet.cssRules, sheet.href ?? document.baseURI);
    } catch {
      // A cross-origin sheet hides its rules; its fonts can't be handed on anyway.
    }
  }
  return faces;
}

/**
 * The theme a render gets: the palette, with the colours and fonts the chat actually draws
 * read off the page, and the faces those fonts need, since a sandboxed page can't see the
 * client's own.
 */
export function withLiveDesign(theme: HtmlRenderTheme): HtmlRenderTheme {
  if (typeof document === "undefined" || document.body === null) return theme;
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.append(probe);
  try {
    const variables: Record<string, string> = { ...theme.variables };
    for (const [role, source] of LIVE_COLORS) {
      probe.style.color = `var(${source}, ${UNSET_COLOR})`;
      const resolved = getComputedStyle(probe).color;
      if (resolved !== UNSET_COLOR) variables[role] = resolved;
    }
    for (const name of ["--font-sans", "--font-mono"] as const) {
      probe.style.fontFamily = `var(${name}, ${UNSET_FONT})`;
      const resolved = getComputedStyle(probe).fontFamily;
      if (resolved !== UNSET_FONT) variables[name] = resolved;
    }
    const fontFaces = fontFacesForStacks(declaredFontFaces(), [
      variables["--font-sans"] ?? "",
      variables["--font-mono"] ?? "",
    ]);
    return { ...theme, variables, ...(fontFaces.length === 0 ? {} : { fontFaces }) };
  } finally {
    probe.remove();
  }
}
