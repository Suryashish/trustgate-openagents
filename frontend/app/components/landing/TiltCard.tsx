"use client";

import { useRef, type ReactNode, type CSSProperties } from "react";

export function TiltCard({
  children,
  className = "",
  innerClassName = "",
  style,
  intensity = 1,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  style?: CSSProperties;
  intensity?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const raf = useRef(0);

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width - 0.5) * 2;
    const py = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      el.style.setProperty("--tx", String(px * intensity));
      el.style.setProperty("--ty", String(py * intensity));
    });
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tx", "0");
    el.style.setProperty("--ty", "0");
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={"bh-tilt " + className}
      style={style}
    >
      <div className={"bh-tilt-inner " + innerClassName}>{children}</div>
    </div>
  );
}
