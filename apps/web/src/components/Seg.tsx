import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";

/** A two- or three-way switch, the design's `.seg` with its sliding pill. */
export function Seg<T extends string>(props: {
  readonly label: string;
  readonly options: ReadonlyArray<T>;
  readonly value: T | null;
  readonly onChange: (value: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<CSSProperties | null>(null);
  const index = props.value === null ? -1 : props.options.indexOf(props.value);
  useLayoutEffect(() => {
    const on = ref.current?.querySelectorAll("button")[index];
    setPill(
      on ? ({ "--x": `${on.offsetLeft}px`, "--w": `${on.offsetWidth}px` } as CSSProperties) : null,
    );
  }, [index]);
  return (
    <div ref={ref} className="seg sm" role="group" aria-label={props.label}>
      {props.options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === props.value}
          onClick={() => props.onChange(option)}
        >
          {option}
        </button>
      ))}
      {pill === null ? null : <i className="seg-pill" aria-hidden="true" style={pill} />}
    </div>
  );
}
