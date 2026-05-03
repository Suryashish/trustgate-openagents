"use client";

import { useEffect, useRef, useState } from "react";

/** Number that counts up from 0 to `value` once it scrolls into view. */
export function LiveStat({
  value,
  duration = 1400,
  prefix = "",
  suffix = "",
  className = "",
}: {
  value: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [shown, setShown] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / duration);
        // easeOutCubic
        const e = 1 - Math.pow(1 - t, 3);
        setShown(Math.round(e * value));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => en.isIntersecting && start());
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {shown.toLocaleString()}
      {suffix}
    </span>
  );
}
