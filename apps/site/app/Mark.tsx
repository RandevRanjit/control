/** Control's stair mark, drawn in the current colour. */
export function Mark({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 12) / 19} viewBox="0 0 19 12" aria-hidden="true">
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
