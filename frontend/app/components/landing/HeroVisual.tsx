"use client";

import { useEffect, useRef } from "react";

const ORBIT_TAGS = [
  { label: "swap",         angle: -10, r: 0.94 },
  { label: "defi",         angle:  42, r: 1.02 },
  { label: "summarise",    angle:  98, r: 0.92 },
  { label: "uppercase",    angle: 150, r: 1.04 },
  { label: "research",     angle: 208, r: 0.96 },
  { label: "translate",    angle: 268, r: 1.00 },
  { label: "ens · resolve",angle: 320, r: 0.98 },
];

export function HeroVisual() {
  const wrap = useRef<HTMLDivElement | null>(null);
  const raf = useRef(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;

    let mx = 0;
    let my = 0;
    let cx = 0;
    let cy = 0;

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      // -1..1 across the composition
      mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      my = ((e.clientY - r.top) / r.height - 0.5) * 2;
    };
    const onLeave = () => {
      mx = 0;
      my = 0;
    };

    const tick = () => {
      // smoothing
      cx += (mx - cx) * 0.08;
      cy += (my - cy) * 0.08;
      el.style.setProperty("--hx", cx.toFixed(3));
      el.style.setProperty("--hy", cy.toFixed(3));
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <div
      ref={wrap}
      className="relative aspect-square w-full max-w-[560px] mx-auto select-none"
      style={{ ["--hx" as string]: 0, ["--hy" as string]: 0 }}
    >
      {/* paper backdrop */}
      <div className="absolute inset-0 rounded-sm bg-bh-paper-soft shadow-[0_30px_60px_-30px_rgba(31,28,24,0.32)]">
        <div className="absolute inset-0 bh-grid-fine opacity-60 rounded-sm" />
        <div className="absolute inset-0 bh-grain rounded-sm" />
        <div className="absolute inset-0 bh-mesh opacity-90 rounded-sm" />
      </div>

      {/* hairlines */}
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 h-full w-full pointer-events-none"
        aria-hidden
      >
        <line x1="0" y1="100" x2="200" y2="100" stroke="var(--bh-ink)" strokeWidth="0.7" strokeDasharray="2 4" opacity="0.45"/>
        <line x1="100" y1="0" x2="100" y2="200" stroke="var(--bh-ink)" strokeWidth="0.7" strokeDasharray="2 4" opacity="0.35"/>
        <circle cx="100" cy="100" r="74" fill="none" stroke="var(--bh-ink)" strokeWidth="0.6" strokeDasharray="1 4" opacity="0.4"/>
      </svg>

      {/* deep blue square — heaviest parallax */}
      <div
        className="absolute left-[6%] top-[10%] h-[58%] w-[58%] bh-anim-float-y will-change-transform"
        style={{
          background: "var(--bh-blue)",
          transform:
            "translate3d(calc(var(--hx) * 18px), calc(var(--hy) * 18px), 0)",
          transition: "transform 80ms linear",
        }}
      >
        <div className="absolute -inset-8 -z-10 bg-[var(--bh-blue)] opacity-30 blur-3xl rounded-full" />
        <div className="absolute inset-3 border border-bh-canvas/40 mix-blend-overlay" />
      </div>

      {/* yellow circle — medium parallax */}
      <div
        className="absolute right-[8%] top-[14%] h-[44%] w-[44%] rounded-full bh-anim-float-x bh-delay-200 will-change-transform"
        style={{
          background: "var(--bh-yellow)",
          transform:
            "translate3d(calc(var(--hx) * -22px), calc(var(--hy) * -10px), 0)",
          transition: "transform 80ms linear",
        }}
      >
        <div className="absolute -inset-10 -z-10 rounded-full bg-bh-yellow opacity-50 blur-3xl" />
      </div>

      {/* red triangle — light parallax */}
      <svg
        viewBox="0 0 100 100"
        className="absolute bottom-[6%] right-[10%] h-[40%] w-[40%] bh-anim-drift bh-delay-300 will-change-transform"
        style={{
          transform:
            "translate3d(calc(var(--hx) * 12px), calc(var(--hy) * -16px), 0)",
          transition: "transform 80ms linear",
        }}
      >
        <polygon points="0,100 100,100 100,0" fill="var(--bh-red)" />
        <polygon points="0,100 100,100 100,0" fill="none" stroke="var(--bh-ink)" strokeWidth="1" opacity="0.4" />
      </svg>

      {/* small black square — opposite parallax */}
      <div
        className="absolute -top-3 -right-3 h-12 w-12 bg-bh-ink will-change-transform"
        style={{
          transform:
            "translate3d(calc(var(--hx) * -28px), calc(var(--hy) * -22px), 0)",
        }}
      />

      {/* Spinning hairline ring — bottom-left corner */}
      <svg
        viewBox="0 0 100 100"
        className="absolute -bottom-8 -left-8 h-32 w-32 bh-anim-spin-slow"
      >
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--bh-ink)" strokeWidth="0.8" strokeDasharray="2 6" opacity="0.6" />
        <circle cx="50" cy="6" r="4" fill="var(--bh-red)" />
        <rect x="46" y="92" width="8" height="8" fill="var(--bh-ink)" />
      </svg>

      {/* Counter-spinning faint ring */}
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-[18%] bh-anim-spin-rev pointer-events-none"
      >
        <circle cx="50" cy="50" r="49" fill="none" stroke="var(--bh-ink)" strokeWidth="0.4" strokeDasharray="1 7" opacity="0.45"/>
      </svg>

      {/* Concentric pulsing dot at center */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="relative flex h-3 w-3">
          <span className="bh-anim-pulse-ring absolute inset-0 rounded-full bg-bh-red" />
          <span className="bh-anim-pulse-ring bh-delay-700 absolute inset-0 rounded-full bg-bh-yellow" />
          <span className="relative h-3 w-3 rounded-full bg-bh-ink" />
        </span>
      </div>

      {/* Orbiting capability tags */}
      <div className="absolute inset-0 pointer-events-none">
        {ORBIT_TAGS.map((t, i) => (
          <OrbitTag
            key={t.label}
            label={t.label}
            angle={t.angle}
            radius={`calc(${42 * t.r}% )`}
            delayMs={i * 80}
          />
        ))}
      </div>

      {/* tag label */}
      <div className="absolute -bottom-7 left-2 font-mono text-[10px] uppercase tracking-[0.3em] text-bh-mute">
        composition · 01 · trustgate
      </div>
      <div className="absolute -bottom-7 right-2 font-mono text-[10px] uppercase tracking-[0.3em] text-bh-mute flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-bh-red bh-anim-blink" />
        live composition
      </div>
    </div>
  );
}

function OrbitTag({
  label,
  angle,
  radius,
  delayMs,
}: {
  label: string;
  angle: number;
  radius: string;
  delayMs: number;
}) {
  // angle 0..360; place via polar around the center
  const rad = (angle * Math.PI) / 180;
  const x = `calc(50% + cos(${angle}deg) * ${radius})`;
  const y = `calc(50% + sin(${angle}deg) * ${radius})`;
  // fallback for browsers without trig in calc — derive numerics
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);

  return (
    <div
      className="absolute bh-anim-rise"
      style={{
        left: `calc(50% + ${dx * 50}%)`,
        top: `calc(50% + ${dy * 50}%)`,
        transform: "translate(-50%, -50%)",
        animationDelay: `${600 + delayMs}ms`,
      }}
    >
      <div
        className="bh-anim-float-y"
        style={{
          animationDelay: `${delayMs}ms`,
        }}
      >
        <span className="inline-flex items-center gap-1.5 border border-bh-ink/40 bg-bh-canvas/85 backdrop-blur-sm px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-bh-ink/85 shadow-[0_4px_14px_-8px_rgba(31,28,24,0.5)]">
          <span className="inline-block h-1 w-1 rounded-full bg-bh-red" />
          {label}
        </span>
      </div>
    </div>
  );
}
