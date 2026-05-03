"use client";

/**
 * Decorative bauhaus mini-bar chart used in the Numbers tiles.
 * Pure SVG + SMIL so it animates without JS state.
 */
export function MiniBars({
  color = "var(--bh-ink)",
  count = 9,
  className = "",
}: {
  color?: string;
  count?: number;
  className?: string;
}) {
  const bars = Array.from({ length: count });
  return (
    <svg viewBox={`0 0 ${count * 8 + 4} 30`} className={"w-full " + className}>
      {bars.map((_, i) => {
        const dur = 1.2 + (i % 4) * 0.3;
        const peak = 8 + ((i * 5) % 18);
        return (
          <rect key={i} x={2 + i * 8} width="5" rx="0.5" fill={color}>
            <animate
              attributeName="height"
              values={`${4};${peak};${4}`}
              dur={`${dur}s`}
              repeatCount="indefinite"
              begin={`${(i % 5) * 0.15}s`}
            />
            <animate
              attributeName="y"
              values={`${30 - 4};${30 - peak};${30 - 4}`}
              dur={`${dur}s`}
              repeatCount="indefinite"
              begin={`${(i % 5) * 0.15}s`}
            />
          </rect>
        );
      })}
    </svg>
  );
}

/**
 * A spinning text ring — text laid out around a circle.
 * Uses SVG textPath to keep it crisp at any scale.
 */
export function CircularText({
  text,
  size = 130,
  className = "",
}: {
  text: string;
  size?: number;
  className?: string;
}) {
  const id = `ct-${text.replace(/\W+/g, "")}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={"bh-anim-spin-slow " + className}
      aria-hidden
    >
      <defs>
        <path id={id} d="M 50,50 m -36,0 a 36,36 0 1,1 72,0 a 36,36 0 1,1 -72,0" />
      </defs>
      <text fontSize="7.4" fontFamily="ui-monospace, monospace" letterSpacing="2.2" fill="currentColor">
        <textPath href={`#${id}`}>{text}</textPath>
      </text>
    </svg>
  );
}

/**
 * Animated progress arc — used in numbers tile, suggests live behaviour.
 */
export function ProgressArc({
  pct = 78,
  color = "var(--bh-ink)",
  size = 80,
  className = "",
}: {
  pct?: number;
  color?: string;
  size?: number;
  className?: string;
}) {
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="var(--bh-line-strong)" strokeWidth="6" />
      <circle
        cx="50"
        cy="50"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="6"
        strokeLinecap="square"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 50 50)"
      >
        <animate
          attributeName="stroke-dashoffset"
          values={`${c};${offset}`}
          dur="1.6s"
          fill="freeze"
        />
      </circle>
    </svg>
  );
}
