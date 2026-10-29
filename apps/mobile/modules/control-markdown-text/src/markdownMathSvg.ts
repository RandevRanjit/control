import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import "mathjax-full/js/input/tex/base/BaseConfiguration.js";
import "mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js";
import "mathjax-full/js/input/tex/braket/BraketConfiguration.js";
import "mathjax-full/js/input/tex/cancel/CancelConfiguration.js";
import "mathjax-full/js/input/tex/color/ColorConfiguration.js";
import "mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js";
import { mathjax } from "mathjax-full/js/mathjax.js";
import { SVG } from "mathjax-full/js/output/svg.js";

/** A typeset formula. Sizes are in ems of the font it sits in. */
export interface MarkdownMathSvg {
  readonly xml: string;
  readonly width: number;
  readonly height: number;
  /** How far the formula reaches below the text baseline. */
  readonly depth: number;
}

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
// Roughly KaTeX's macro set on web. No `html` or `action` package, so a formula can
// emit no links or styles; errors throw, so broken TeX stays readable as source.
const makeDocument = () =>
  mathjax.document("", {
    InputJax: new TeX({
      packages: ["base", "ams", "newcommand", "boldsymbol", "braket", "cancel", "color"],
      formatError: (_jax: unknown, error: Error) => {
        throw error;
      },
    }),
    // Inline paths: react-native-svg draws each formula on its own, with no shared defs.
    OutputJax: new SVG({ fontCache: "none" }),
  });
let document = makeDocument();
// MathJax keeps definitions for the document's life. A formula that makes one gets a
// fresh document after it (about 1 ms), so it can't change the formulas that follow.
const DEFINITION_PATTERN =
  /\\(?:(?:re)?new(?:command|environment)|[egx]?def|let|DeclareMathOperator)(?![a-zA-Z])/;

const VIEW_BOX_PATTERN = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/;
// Threads remount messages while scrolling; cached output keeps that from typesetting
// the same formula again. null records a parse error.
const cache = new Map<string, MarkdownMathSvg | null>();
const CACHE_SIZE = 500;

function typeset(tex: string, display: boolean): MarkdownMathSvg | null {
  try {
    // The root's CSS vertical-align means nothing to react-native-svg; depth replaces it.
    const xml = adaptor
      .innerHTML(document.convert(tex, { display }))
      .replace(/^<svg style="[^"]*"/, "<svg");
    const viewBox = VIEW_BOX_PATTERN.exec(xml);
    if (!viewBox) return null;
    // MathJax draws 1000 units to the em, with the baseline at y = 0.
    const top = Number(viewBox[2]);
    const width = Number(viewBox[3]) / 1000;
    const height = Number(viewBox[4]) / 1000;
    return { xml, width, height, depth: height + top / 1000 };
  } catch {
    return null;
  } finally {
    if (DEFINITION_PATTERN.test(tex)) document = makeDocument();
  }
}

/** TeX as SVG markup for react-native-svg, or null when MathJax cannot parse it. */
export function markdownMathSvg(tex: string, display: boolean): MarkdownMathSvg | null {
  const key = `${display ? "display" : "inline"}:${tex}`;
  if (cache.has(key)) return cache.get(key) ?? null;
  const svg = typeset(tex, display);
  cache.set(key, svg);
  if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  return svg;
}
