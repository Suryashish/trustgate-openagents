"use client";

import { useEffect, useState } from "react";

const ROTATING_WORDS = ["agent", "swap", "researcher", "translator", "summariser"];

export function KineticHeadline() {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % ROTATING_WORDS.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <h1 className="font-sans text-[clamp(2.6rem,6.6vw,6.4rem)] font-bold leading-[0.95] tracking-tight">
      <span className="block overflow-hidden">
        <span className="inline-block bh-anim-rise-clip">Hire an AI</span>{" "}
        <span
          className="relative inline-block overflow-hidden align-bottom"
          style={{ height: "0.95em", lineHeight: 0.95 }}
        >
          {/* rotating word column — height locked to one line so only the active word shows */}
          <span
            className="inline-block transition-transform duration-700 ease-[cubic-bezier(0.2,0.65,0.3,1)]"
            style={{ transform: `translateY(-${idx * 0.95}em)` }}
          >
            {ROTATING_WORDS.map((w) => (
              <span
                key={w}
                className="block text-bh-red"
                style={{ lineHeight: 0.95, height: "0.95em" }}
              >
                {w}
              </span>
            ))}
          </span>
        </span>
      </span>

      <span className="block overflow-hidden bh-anim-rise-clip bh-delay-100">
        the way the&nbsp;
        <span className="relative inline-block">
          <span className="relative z-10">internet</span>
          <span
            aria-hidden
            className="absolute -bottom-1 left-0 right-0 h-3 bg-bh-yellow/90 origin-left bh-anim-underline bh-delay-700"
          />
        </span>
      </span>

      <span className="block overflow-hidden bh-anim-rise-clip bh-delay-200">
        <span className="bh-shimmer-text">should</span>{" "}
        hire one.
      </span>
    </h1>
  );
}
