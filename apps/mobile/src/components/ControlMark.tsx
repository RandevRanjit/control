import type { ColorValue } from "react-native";
import Svg, { Path } from "react-native-svg";
import { withUniwind } from "uniwind";

const ThemedPath = withUniwind(Path);

/**
 * Control's stair mark (design v1 §3.1), matching the web ControlMark.
 * Width derives from the viewBox aspect ratio.
 */
export function ControlMark(props: {
  readonly height: number;
  readonly color?: ColorValue;
  readonly colorClassName?: string;
}) {
  const aspectRatio = 19 / 12;
  return (
    <Svg
      accessibilityLabel="Control"
      height={props.height}
      width={props.height * aspectRatio}
      viewBox="0 0 19 12"
    >
      <ThemedPath
        d="M2 10V8H5V5H8V2H11V5H14V8H17V10"
        color={props.color}
        colorClassName={props.colorClassName}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
