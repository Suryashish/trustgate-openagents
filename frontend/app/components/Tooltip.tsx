"use client";

import { useState, useId } from "react";

/**
 * Hover tooltip with a tiny dotted underline as the affordance. Pure CSS
 * positioning + opacity transition — no popper/floating-ui dependency.
 *
 * Use sparingly: only on jargon that's not obvious from context. Prefer
 * inline copy over tooltips when the explanation is short enough to fit.
 *
 *   <Tooltip text="60% reputation, 20% price, 20% latency">60/20/20</Tooltip>
 */
export function Tooltip({
  text,
  children,
  className = "",
}: {
  text: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [show, setShow] = useState(false);
  const tipId = useId();
  return (
    <span
      className={
        "relative inline-block cursor-help underline decoration-dotted decoration-bh-mute-2 underline-offset-2 " +
        className
      }
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      tabIndex={0}
      aria-describedby={tipId}
    >
      {children}
      <span
        id={tipId}
        role="tooltip"
        className={
          "pointer-events-none absolute left-1/2 top-full z-50 mt-1 w-max max-w-xs -translate-x-1/2 rounded bg-bh-paper px-2 py-1 text-[11px] font-normal leading-snug text-bh-ink ring-1 ring-bh-line-strong transition-opacity duration-100 " +
          (show ? "opacity-100" : "opacity-0")
        }
      >
        {text}
      </span>
    </span>
  );
}
