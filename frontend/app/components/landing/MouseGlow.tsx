"use client";

import { useEffect } from "react";

export function MouseGlow({ dark = false }: { dark?: boolean }) {
  useEffect(() => {
    let raf = 0;
    let tx = window.innerWidth / 2;
    let ty = window.innerHeight * 0.3;
    const root = document.documentElement;

    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        root.style.setProperty("--mx", `${tx}px`);
        root.style.setProperty("--my", `${ty}px`);
      });
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      aria-hidden
      className={"bh-mouse-glow" + (dark ? " is-dark" : "")}
    />
  );
}
