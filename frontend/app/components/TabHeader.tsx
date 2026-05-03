"use client";

/**
 * Compact tab page header — Bauhaus eyebrow + title + subtitle.
 *
 * Mirrors the section-header pattern from the landing page but tuned for a
 * tighter dashboard rhythm. Drop this at the top of each Tab's render and
 * the tabs gain a consistent visual identity.
 */
export function TabHeader({
  eyebrow,
  title,
  subtitle,
  glyph,
  glyphColor = "var(--bh-red)",
  right,
}: {
  eyebrow: string;
  title: string;
  subtitle?: React.ReactNode;
  glyph?: "square" | "circle" | "triangle";
  glyphColor?: string;
  right?: React.ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-bh-line-strong pb-4">
      <div className="min-w-0">
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.35em] text-bh-mute-2">
          {glyph && <Glyph kind={glyph} color={glyphColor} />}
          <span>{eyebrow}</span>
        </div>
        <h2 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight leading-[1.05] text-bh-ink">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bh-ink-soft">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}

function Glyph({ kind, color }: { kind: "square" | "circle" | "triangle"; color: string }) {
  if (kind === "circle") {
    return <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} />;
  }
  if (kind === "triangle") {
    return (
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
        <polygon points="6,1 11,11 1,11" fill={color} />
      </svg>
    );
  }
  return <span className="inline-block h-3 w-3" style={{ background: color }} />;
}

/**
 * Smaller in-page section heading — for grouping panels within a tab.
 * Renders an eyebrow + title with a thin underline.
 */
export function SectionTitle({
  eyebrow,
  title,
  children,
  right,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && (
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-bh-mute-2">
            {eyebrow}
          </div>
        )}
        <h3 className="text-base font-semibold tracking-tight text-bh-ink">{title}</h3>
        {children && <p className="mt-1 text-xs text-bh-mute">{children}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
