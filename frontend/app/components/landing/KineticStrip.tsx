"use client";

const ITEMS = [
  "trustgate",
  "▢",
  "erc-8004",
  "○",
  "axl mesh",
  "△",
  "base sepolia",
  "▢",
  "60 · 20 · 20",
  "○",
  "no central server",
  "△",
];

export function KineticStrip({
  variant = "light",
  reverse = false,
}: {
  variant?: "light" | "dark" | "yellow";
  reverse?: boolean;
}) {
  const doubled = [...ITEMS, ...ITEMS, ...ITEMS];

  const bg =
    variant === "dark"
      ? "bg-bh-ink text-bh-canvas border-y border-bh-ink"
      : variant === "yellow"
      ? "bg-bh-yellow text-bh-ink border-y border-bh-ink/40"
      : "bg-bh-canvas-deep text-bh-ink border-y border-bh-line-strong";

  return (
    <div className={"relative z-10 overflow-hidden " + bg}>
      <div
        className={
          "flex w-max items-center gap-10 py-4 text-3xl md:text-4xl font-bold tracking-tight " +
          (reverse ? "bh-anim-marquee-rev" : "bh-anim-marquee")
        }
      >
        {doubled.map((it, i) => (
          <span key={i} className="flex items-center gap-10">
            <span className="opacity-90">{it}</span>
            <span
              aria-hidden
              className={
                "inline-block h-2 w-2 rotate-45 " +
                (variant === "dark" ? "bg-bh-yellow" : "bg-bh-red")
              }
            />
          </span>
        ))}
      </div>
    </div>
  );
}
