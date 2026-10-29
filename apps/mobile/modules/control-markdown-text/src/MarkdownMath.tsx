import { ScrollView, Text, View, type ColorValue } from "react-native";
import { SvgXml } from "react-native-svg";

import { MATH_FONT_SCALE, type NativeMarkdownFormula } from "./nativeMarkdownText";
import type { NativeMarkdownTextStyle } from "./SelectableMarkdownText.types";

let typesetFormula: typeof import("./markdownMathSvg").markdownMathSvg | undefined;

/** MathJax loads with the first formula, so threads without math never pay for it. */
export function markdownMathSvg(tex: string, display: boolean) {
  typesetFormula ??= (require("./markdownMathSvg") as typeof import("./markdownMathSvg"))
    .markdownMathSvg;
  return typesetFormula(tex, display);
}

/**
 * A formula inside a line of React Native text, sitting on its baseline like web.
 * `raise` is how far the text sits above where the line sets inline views.
 */
export function InlineMath(props: {
  readonly formula: NativeMarkdownFormula;
  readonly fontSize: number;
  readonly color: ColorValue;
  readonly raise: number;
}) {
  const tex = props.formula.tex.trim();
  const svg = markdownMathSvg(tex, props.formula.display);
  if (!svg) return `\\(${tex}\\)`;
  const size = props.fontSize * MATH_FONT_SCALE;
  return (
    <View
      accessible
      accessibilityLabel={tex}
      style={{
        width: svg.width * size,
        height: svg.height * size,
        transform: [{ translateY: svg.depth * size - props.raise }],
      }}
    >
      <SvgXml xml={svg.xml} width="100%" height="100%" color={props.color} />
    </View>
  );
}

/** A display formula, centred, scrolling sideways when wider than the thread. */
export function DisplayMath(props: {
  readonly tex: string;
  readonly textStyle: NativeMarkdownTextStyle;
}) {
  const tex = props.tex.trim();
  const svg = markdownMathSvg(tex, true);
  if (!svg) {
    return (
      <Text
        selectable
        selectionColor={props.textStyle.selectionColor}
        style={{
          color: props.textStyle.color,
          fontFamily: props.textStyle.fontFamily,
          fontSize: props.textStyle.fontSize,
          lineHeight: props.textStyle.lineHeight,
        }}
      >
        {`\\[\n${tex}\n\\]`}
      </Text>
    );
  }
  const size = props.textStyle.fontSize * MATH_FONT_SCALE;
  return (
    <ScrollView
      horizontal
      bounces={false}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ flexGrow: 1, justifyContent: "center", paddingVertical: 4 }}
    >
      <View
        accessible
        accessibilityLabel={tex}
        style={{ width: svg.width * size, height: svg.height * size }}
      >
        <SvgXml xml={svg.xml} width="100%" height="100%" color={props.textStyle.color} />
      </View>
    </ScrollView>
  );
}
