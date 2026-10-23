import type { SVGProps } from "react";

/** Control's stair mark (design v1 §3.1). */
export function ControlMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 19 12" xmlns="http://www.w3.org/2000/svg">
      <polyline
        points="1,11 1,9 4,9 4,6 7,6 7,3 10,3 10,6 13,6 13,9 16,9 16,11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(1 -1)"
      />
    </svg>
  );
}
