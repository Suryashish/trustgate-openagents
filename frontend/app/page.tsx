import Link from "next/link";
import { MouseGlow } from "./components/landing/MouseGlow";
import { HeroVisual } from "./components/landing/HeroVisual";
import { KineticHeadline } from "./components/landing/KineticHeadline";
import { FlowDiagram } from "./components/landing/FlowDiagram";
import { TiltCard } from "./components/landing/TiltCard";
import { LiveStat } from "./components/landing/LiveStat";
import { KineticStrip } from "./components/landing/KineticStrip";
import { MiniBars, CircularText, ProgressArc } from "./components/landing/MiniBars";

export default function Landing() {
  return (
    <div className="relative flex min-h-screen flex-1 flex-col bg-bh-canvas text-bh-ink overflow-x-hidden">
      <MouseGlow />

      {/* base canvas — grain + grid + mesh */}
      <div className="pointer-events-none absolute inset-0 bh-grid opacity-50" aria-hidden />
      <div className="pointer-events-none absolute inset-0 bh-grain" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[120vh] bh-mesh opacity-90" aria-hidden />

      <BackdropShapes />

      <Nav />
      <Hero />
      <KineticStrip variant="dark" />
      <Pipeline />
      <KineticStrip variant="yellow" reverse />
      <Architecture />
      <Numbers />
      <Manifesto />
      <CTA />
      <KineticStrip variant="dark" reverse />
      <Footer />
    </div>
  );
}

/* ─────────────────────────── Nav ─────────────────────────── */

function Nav() {
  return (
    <header className="relative z-30">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
        <Link href="/" className="group flex items-center gap-3">
          <Logomark />
          <span className="font-semibold tracking-tight text-base">TrustGate</span>
          <span className="hidden sm:inline-block rounded-sm bg-bh-ink/85 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest text-bh-canvas">
            v1 · base sepolia
          </span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm">
          <a href="#pipeline" className="hover:text-bh-red transition-colors">Pipeline</a>
          <a href="#architecture" className="hover:text-bh-blue-bright transition-colors">Architecture</a>
          <a href="#numbers" className="hover:text-bh-red transition-colors">Numbers</a>
          <a href="#manifesto" className="hover:text-bh-blue-bright transition-colors">Manifesto</a>
        </nav>
        <Link
          href="/dashboard"
          className="bh-btn bh-btn-glow bg-bh-ink text-bh-canvas px-4 py-2 text-sm font-medium tracking-tight"
        >
          Launch dashboard →
        </Link>
      </div>
    </header>
  );
}

function Logomark() {
  return (
    <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden className="bh-anim-spin-slow [animation-duration:60s]">
      <rect x="1" y="1" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="17" r="9" fill="var(--bh-red)" />
      <rect x="13" y="13" width="8" height="8" fill="var(--bh-yellow)" />
    </svg>
  );
}

/* ─────────────────────────── Hero ─────────────────────────── */

function Hero() {
  return (
    <section className="relative z-10 mx-auto w-full max-w-7xl px-6 pt-10 pb-20 md:pt-14 md:pb-28">
      <div className="grid items-start gap-12 md:grid-cols-12">
        <div className="md:col-span-7">
          <div className="bh-anim-rise">
            <span className="inline-flex items-center gap-2 border border-bh-line-strong bg-bh-canvas/70 px-2.5 py-1 text-[11px] font-mono uppercase tracking-widest backdrop-blur-sm">
              <span className="relative flex h-2 w-2">
                <span className="bh-anim-pulse-ring absolute inset-0 rounded-full bg-bh-red" />
                <span className="relative h-2 w-2 rounded-full bg-bh-red" />
              </span>
              ethglobal openagents · live on base sepolia
            </span>
          </div>

          <div className="mt-6">
            <KineticHeadline />
          </div>

          <p className="bh-anim-rise bh-delay-300 mt-7 max-w-xl text-lg leading-relaxed text-bh-ink-soft">
            TrustGate reads the live ERC-8004 registries, ranks every candidate with a
            transparent <span className="font-mono text-bh-ink">60/20/20</span> score, and
            routes the job over the Gensyn AXL P2P mesh.
            <span className="text-bh-ink"> No central server. No hardcoded API.</span>
          </p>

          <div className="bh-anim-rise bh-delay-400 mt-8 flex flex-wrap items-center gap-4">
            <Link
              href="/dashboard"
              className="bh-btn bh-btn-glow bg-bh-ink text-bh-canvas px-6 py-3 text-sm font-medium tracking-tight"
            >
              Open the dashboard
            </Link>
            <a href="#pipeline" className="bh-btn-ghost px-6 py-3 text-sm font-medium tracking-tight">
              See how it works
            </a>
            <span className="ml-2 font-mono text-xs uppercase tracking-widest text-bh-mute flex items-center gap-2">
              <span className="inline-block h-px w-6 bg-bh-mute" />
              scroll
            </span>
          </div>

          {/* Live strip with animated counters */}
          <div className="bh-anim-rise bh-delay-500 mt-10 grid max-w-xl grid-cols-3 gap-px border border-bh-line-strong bg-bh-line-strong">
            <HeroStat value={5412} label="onchain id" sub="agent · trustgate" />
            <HeroStat value={3} label="axl nodes" sub="local mesh · peered" />
            <HeroStat value={62} label="ms" sub="median delivery" suffix="ms" stripSuffixFromCount />
          </div>
        </div>

        <div className="md:col-span-5 relative md:pt-6">
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}

function HeroStat({
  value,
  label,
  sub,
  suffix = "",
  stripSuffixFromCount,
}: {
  value: number;
  label: string;
  sub: string;
  suffix?: string;
  stripSuffixFromCount?: boolean;
}) {
  return (
    <div className="bg-bh-canvas/85 backdrop-blur-sm p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-bh-mute">{label}</div>
      <div className="mt-1.5 text-2xl font-bold tracking-tight">
        <LiveStat value={value} suffix={stripSuffixFromCount ? "" : suffix} />
        {stripSuffixFromCount && <span className="text-bh-mute text-base font-medium ml-0.5">{suffix}</span>}
      </div>
      <div className="mt-1 text-[11px] text-bh-mute">{sub}</div>
    </div>
  );
}

/* ─────────────────────────── Backdrop shapes ─────────────────────────── */

function BackdropShapes() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -top-24 -left-20 h-80 w-80 rounded-full opacity-30 blur-3xl bh-anim-drift"
        style={{ background: "var(--bh-blue)" }}
      />
      <div
        className="absolute top-[35%] -right-32 h-96 w-96 rounded-full opacity-25 blur-3xl bh-anim-drift"
        style={{ background: "var(--bh-yellow)", animationDelay: "1.5s" }}
      />
      <div
        className="absolute bottom-0 left-[30%] h-72 w-72 rounded-full opacity-20 blur-3xl bh-anim-drift"
        style={{ background: "var(--bh-red)", animationDelay: "3s" }}
      />
    </div>
  );
}

/* ─────────────────────────── Pipeline ─────────────────────────── */

function Pipeline() {
  return (
    <section id="pipeline" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24">
      <SectionHeader
        eyebrow="01 · pipeline"
        title="Three primitives. One hire."
        body="Discovery, ranking, and delivery — each a distinct primitive, each one built from public infrastructure."
      />
      <div className="mt-14 grid gap-8 md:grid-cols-3">
        <PipelineCard
          tag="discover"
          tagColor="var(--bh-red)"
          title="Read the registry"
          body="Walks the ERC-8004 IdentityRegistry, hydrates each agent card from data:, IPFS, or HTTPS. Caches everything."
          shape={<ShapeSquare />}
          ringText="discover · scan · cache · verify · "
        />
        <PipelineCard
          tag="rank"
          tagColor="var(--bh-blue-bright)"
          title="Score, transparently"
          body="A single weighted formula — 60% reputation, 20% price, 20% latency — applied to every candidate. No black box."
          shape={<ShapeCircle />}
          ringText="rank · score · weight · pick · "
        />
        <PipelineCard
          tag="deliver"
          tagColor="var(--bh-ink)"
          title="Send over AXL"
          body="The job hops the Gensyn AXL P2P mesh to the winner. Retries on timeout, falls back to the runner-up."
          shape={<ShapeTriangle />}
          ringText="deliver · route · retry · settle · "
        />
      </div>
    </section>
  );
}

function PipelineCard({
  tag,
  tagColor,
  title,
  body,
  shape,
  ringText,
}: {
  tag: string;
  tagColor: string;
  title: string;
  body: string;
  shape: React.ReactNode;
  ringText: string;
}) {
  return (
    <TiltCard className="bh-card relative">
      <article className="group relative overflow-hidden border border-bh-line-strong bg-bh-paper/70 p-8 backdrop-blur-sm">
        <div className="absolute inset-0 bh-grain opacity-50" />
        <div className="relative flex items-start justify-between">
          <span
            className="font-mono text-[10px] uppercase tracking-[0.35em]"
            style={{ color: tagColor }}
          >
            ▸ {tag}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-bh-mute">
            fig. {tag.length}
          </span>
        </div>

        <div className="relative mt-8 mb-10 flex h-44 items-center justify-center">
          <div className="absolute inset-0 flex items-center justify-center text-bh-mute">
            <CircularText text={ringText.repeat(3)} size={170} />
          </div>
          {shape}
        </div>

        <h3 className="relative text-2xl font-semibold leading-tight tracking-tight">
          {title}
        </h3>
        <p className="relative mt-3 text-sm leading-relaxed text-bh-ink-soft">{body}</p>

        {/* footer rule */}
        <div className="relative mt-6 flex items-center justify-between gap-4">
          <span
            className="block h-px flex-1"
            style={{ background: tagColor, opacity: 0.5 }}
          />
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-bh-mute">
            ▢ ○ △
          </span>
        </div>

        {/* hover-only sweep */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{
            background:
              "linear-gradient(120deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%)",
          }}
        />
      </article>
    </TiltCard>
  );
}

function ShapeSquare() {
  return (
    <div className="relative h-32 w-32">
      {/* halo */}
      <div className="absolute -inset-6 -z-20 bg-bh-red opacity-30 blur-2xl" />

      {/* offset ink shadow square */}
      <div className="absolute inset-0 -z-10 translate-x-2.5 translate-y-2.5 bg-bh-ink" />

      {/* main red square */}
      <div className="absolute inset-0 bg-bh-red" />

      {/* construction: dashed circumscribed ring */}
      <svg
        viewBox="0 0 100 100"
        className="absolute -inset-3 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)] bh-anim-spin-slow"
        aria-hidden
      >
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="none"
          stroke="var(--bh-ink)"
          strokeWidth="0.7"
          strokeDasharray="2 6"
          opacity="0.45"
        />
      </svg>

      {/* inscribed yellow circle (concentric) */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-10 w-10 rounded-full ring-2 ring-bh-ink/60"
        style={{ background: "var(--bh-yellow)" }}
      />

      {/* center ink dot */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-bh-ink bh-anim-pulse-soft" />
    </div>
  );
}

function ShapeCircle() {
  return (
    <div className="relative h-32 w-32">
      <div className="absolute inset-0 rounded-full" style={{ background: "var(--bh-blue-bright)" }} />
      <div className="absolute inset-3 rounded-full border-2 border-bh-canvas mix-blend-overlay" />
      <div className="absolute -inset-6 -z-10 rounded-full opacity-40 blur-2xl" style={{ background: "var(--bh-blue)" }}/>
      <svg className="absolute inset-0 bh-anim-spin-slow" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="48" fill="none" stroke="var(--bh-yellow)" strokeWidth="1" strokeDasharray="2 6"/>
      </svg>
      <svg className="absolute inset-2 bh-anim-spin-rev" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--bh-canvas)" strokeWidth="0.6" strokeDasharray="1 5" opacity="0.7"/>
      </svg>
    </div>
  );
}

function ShapeTriangle() {
  return (
    <div className="relative h-32 w-32">
      {/* halo */}
      <div className="absolute -inset-6 -z-20 bg-bh-yellow opacity-40 blur-2xl rounded-full" />

      {/* construction: dashed circumscribed circle */}
      <svg
        viewBox="0 0 100 100"
        className="absolute -inset-3 h-[calc(100%+1.5rem)] w-[calc(100%+1.5rem)] bh-anim-spin-slow"
        aria-hidden
      >
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="none"
          stroke="var(--bh-ink)"
          strokeWidth="0.7"
          strokeDasharray="2 6"
          opacity="0.45"
        />
      </svg>

      {/* offset ink shadow + main yellow triangle */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        {/* offset shadow */}
        <polygon points="52.5,11 96,93 9,93" fill="var(--bh-ink)" />
        {/* main triangle */}
        <polygon
          points="50,8 93,90 7,90"
          fill="var(--bh-yellow)"
          stroke="var(--bh-ink)"
          strokeWidth="1.2"
        />
        {/* median from apex to base midpoint — Bauhaus construction line */}
        <line
          x1="50"
          y1="8"
          x2="50"
          y2="90"
          stroke="var(--bh-ink)"
          strokeWidth="0.6"
          strokeDasharray="2 3"
          opacity="0.5"
        />
      </svg>

      {/* inscribed red circle at the triangle's centroid (~63% down) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 h-6 w-6 rounded-full ring-2 ring-bh-ink/60 bh-anim-pulse-soft"
        style={{ background: "var(--bh-red)", top: "63%", transform: "translate(-50%, -50%)" }}
      />
    </div>
  );
}

/* ─────────────────────────── Architecture ─────────────────────────── */

function Architecture() {
  return (
    <section id="architecture" className="relative z-10 border-t border-bh-line-strong bg-bh-paper/60">
      <div className="absolute inset-0 bh-grain opacity-50 pointer-events-none" />
      <div className="relative mx-auto w-full max-w-7xl px-6 py-24">
        <SectionHeader
          eyebrow="02 · architecture"
          title="The whole stack, on one page."
          body="Every box is a real component running locally or on Base Sepolia. Every line is a real call. Every dot is a packet in flight."
        />
        <div className="mt-14 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <FlowDiagram />
          </div>
          <div className="lg:col-span-5 space-y-6">
            <ArchitectureLegend />
            <FieldTest />
          </div>
        </div>
      </div>
    </section>
  );
}

function ArchitectureLegend() {
  const rows = [
    { color: "var(--bh-canvas-deep)", border: true, name: "client / read-only", desc: "Dashboard and registry reads — no mutations." },
    { color: "var(--bh-yellow-soft)", name: "service edge", desc: "Flask /api/* — narrowed CORS, OpenAPI-shaped responses." },
    { color: "var(--bh-blue)", name: "axl mesh", desc: "Three nodes peered locally; gRPC + TLS; A2A on top." },
    { color: "var(--bh-blue-bright)", name: "axl mesh · winner", desc: "The node that received the routed job spec." },
    { color: "var(--bh-red)", name: "worker", desc: "The actual agent process (or onchain agent), behind A2A." },
  ];
  return (
    <TiltCard intensity={0.6}>
      <div className="border border-bh-line-strong bg-bh-canvas/85 p-7 backdrop-blur">
        <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-bh-mute">legend</div>
        <h3 className="mt-2 text-2xl font-semibold tracking-tight">Read the diagram</h3>
        <ul className="mt-6 space-y-5">
          {rows.map((r) => (
            <li key={r.name} className="flex items-start gap-4 group">
              <span
                className={"mt-1 inline-block h-5 w-5 flex-none transition-transform group-hover:scale-110 " + (r.border ? "border border-bh-ink/70" : "")}
                style={{ background: r.color }}
              />
              <div>
                <div className="font-medium">{r.name}</div>
                <div className="text-sm text-bh-ink-soft">{r.desc}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </TiltCard>
  );
}

function FieldTest() {
  return (
    <div className="border border-bh-ink/80 bg-bh-ink p-7 text-bh-canvas relative overflow-hidden">
      <div className="absolute -right-8 -top-8 h-28 w-28 rounded-full opacity-50 blur-2xl" style={{ background: "var(--bh-red)" }} />
      <div className="relative flex items-center gap-3">
        <div className="h-8 w-8 bh-stripes" />
        <span className="font-mono text-[10px] uppercase tracking-[0.35em]">field test</span>
      </div>
      <p className="relative mt-3 text-sm leading-relaxed text-bh-canvas/85">
        Base Sepolia stack verified end-to-end: TrustGate is on-chain as
        <span className="text-bh-yellow"> agent #5412</span>, dynamic-gas with
        multi-RPC ENS failover, and KeeperHub gracefully degrades when unreachable.
      </p>

      <div className="relative mt-5 grid grid-cols-3 gap-3">
        <MiniMetric label="agents" value="24" />
        <MiniMetric label="rpc lag" value="62ms" />
        <MiniMetric label="cache hit" value="98%" />
      </div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-bh-canvas/20 bg-bh-canvas/5 p-3">
      <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-bh-canvas/55">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
      <div className="mt-2 h-1 w-8 bg-bh-yellow/80" />
    </div>
  );
}

/* ─────────────────────────── Numbers ─────────────────────────── */

function Numbers() {
  return (
    <section id="numbers" className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24">
      <SectionHeader
        eyebrow="03 · numbers"
        title="Built with intent."
        body="The shape of the system is encoded in four numbers."
      />
      <div className="mt-14 grid gap-px bg-bh-line-strong border border-bh-line-strong md:grid-cols-4">
        <NumberTile
          value={5412}
          prefix="#"
          label="onchain agent id"
          sub="trustgate · base sepolia"
          accent="var(--bh-red)"
          extra={<MiniBars color="var(--bh-red)" count={9} className="h-6" />}
        />
        <NumberTile
          display="60·20·20"
          label="scoring weights"
          sub="reputation · price · latency"
          accent="var(--bh-blue-bright)"
          extra={<WeightSplit />}
        />
        <NumberTile
          value={0}
          label="central servers"
          sub="entirely peer-routed"
          accent="var(--bh-yellow)"
          extra={
            <div className="flex items-center justify-center h-12">
              <CircularText
                text="peer · to · peer · no · server · "
                size={70}
                className="text-bh-mute"
              />
            </div>
          }
        />
        <NumberTile
          display="ERC-8004"
          label="standard"
          sub="identity + reputation"
          accent="var(--bh-ink)"
          extra={<ProgressArc pct={92} color="var(--bh-ink)" size={56} />}
        />
      </div>
    </section>
  );
}

function NumberTile({
  value,
  display,
  prefix,
  label,
  sub,
  accent,
  extra,
}: {
  value?: number;
  display?: string;
  prefix?: string;
  label: string;
  sub: string;
  accent: string;
  extra?: React.ReactNode;
}) {
  return (
    <TiltCard intensity={0.4}>
      <div className="bh-card group relative overflow-hidden bg-bh-canvas p-8">
        <div className="absolute inset-0 bh-grain opacity-40" />
        <div
          className="absolute right-4 top-4 h-3 w-3 transition-transform group-hover:scale-150"
          style={{ background: accent }}
        />
        <div className="relative font-mono text-[10px] uppercase tracking-[0.35em] text-bh-mute">
          {label}
        </div>
        <div className="relative mt-6 text-[clamp(2.4rem,4vw,3.6rem)] font-bold tracking-tight leading-none">
          {typeof value === "number" ? (
            <LiveStat value={value} prefix={prefix} duration={1600} />
          ) : (
            <span className="bh-anim-rise">{display}</span>
          )}
        </div>
        <div className="relative mt-3 text-xs text-bh-ink-soft">{sub}</div>

        <div className="relative mt-4 h-12 flex items-center">{extra}</div>

        <div
          className="relative mt-4 h-1 w-12 transition-all duration-500 group-hover:w-32"
          style={{ background: accent }}
        />
      </div>
    </TiltCard>
  );
}

function WeightSplit() {
  return (
    <div className="flex items-end gap-1.5 h-12">
      <Bar pct={60} color="var(--bh-blue-bright)" label="rep" />
      <Bar pct={20} color="var(--bh-red)" label="price" />
      <Bar pct={20} color="var(--bh-yellow)" label="lat" />
    </div>
  );
}

function Bar({ pct, color, label }: { pct: number; color: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-end h-full">
      <div
        className="w-6 bh-anim-grow-bar"
        style={{
          height: `${pct}%`,
          background: color,
          transformOrigin: "bottom",
          minHeight: "6px",
        }}
      />
      <span className="mt-1 font-mono text-[8px] uppercase tracking-widest text-bh-mute">{label}</span>
    </div>
  );
}

/* ─────────────────────────── Manifesto ─────────────────────────── */

function Manifesto() {
  const principles = [
    {
      n: "I",
      title: "Discovery is public.",
      body: "Every agent on TrustGate comes from the live ERC-8004 registry. No allow-list. No gatekeeper.",
      color: "var(--bh-red)",
      pattern: <PatternSquares />,
    },
    {
      n: "II",
      title: "Ranking is legible.",
      body: "60% reputation, 20% price, 20% latency. The whole formula fits on a hand. So does the bias.",
      color: "var(--bh-blue-bright)",
      pattern: <PatternRings />,
    },
    {
      n: "III",
      title: "Routing is peer-to-peer.",
      body: "Jobs travel over the Gensyn AXL mesh. No router we can shut down — including us.",
      color: "var(--bh-yellow)",
      pattern: <PatternTriangles />,
    },
  ];

  return (
    <section id="manifesto" className="relative z-10 border-t border-bh-line-strong bg-bh-canvas">
      <div className="relative mx-auto w-full max-w-7xl px-6 py-24">
        <SectionHeader
          eyebrow="04 · manifesto"
          title="Three principles."
          body="Stripped of ceremony, this is what TrustGate is for."
        />
        <ol className="mt-14 grid gap-px md:grid-cols-3 border border-bh-line-strong bg-bh-line-strong">
          {principles.map((p) => (
            <li key={p.n} className="bh-card relative overflow-hidden bg-bh-paper">
              <div className="absolute inset-0 opacity-50">{p.pattern}</div>
              <div className="absolute inset-0 bh-grain opacity-40" />
              <div className="relative p-10">
                <div
                  className="font-bold leading-none tracking-tight text-[clamp(3rem,7vw,5.5rem)]"
                  style={{ color: p.color }}
                >
                  {p.n}
                </div>
                <h4 className="mt-4 text-2xl font-semibold tracking-tight">{p.title}</h4>
                <p className="mt-3 text-sm leading-relaxed text-bh-ink-soft">{p.body}</p>
                <div className="mt-8 h-px w-full bg-bh-line-strong" />
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-bh-mute">
                    principle · {p.n.toLowerCase()}
                  </span>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function PatternSquares() {
  return (
    <svg className="h-full w-full" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {Array.from({ length: 5 }).map((_, r) =>
        Array.from({ length: 5 }).map((__, c) => {
          const filled = (r + c) % 3 === 0;
          return (
            <rect
              key={`${r}-${c}`}
              x={c * 40 + 6}
              y={r * 40 + 6}
              width="28"
              height="28"
              fill={filled ? "var(--bh-red)" : "none"}
              stroke="var(--bh-ink)"
              strokeWidth="0.7"
              opacity={filled ? 0.18 : 0.25}
            >
              {filled && (
                <animate
                  attributeName="opacity"
                  values="0.05;0.25;0.05"
                  dur={`${3 + ((r * c) % 3)}s`}
                  repeatCount="indefinite"
                  begin={`${(r + c) * 0.2}s`}
                />
              )}
            </rect>
          );
        })
      )}
    </svg>
  );
}

function PatternRings() {
  return (
    <svg className="h-full w-full" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {[20, 35, 50, 65, 80].map((r, i) => (
        <circle
          key={r}
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke="var(--bh-blue-bright)"
          strokeWidth="0.7"
          opacity="0.35"
          strokeDasharray={i % 2 ? "2 4" : "none"}
        >
          <animate
            attributeName="r"
            values={`${r};${r + 4};${r}`}
            dur={`${4 + i}s`}
            repeatCount="indefinite"
          />
        </circle>
      ))}
      <circle cx="100" cy="100" r="3" fill="var(--bh-blue)" />
    </svg>
  );
}

function PatternTriangles() {
  return (
    <svg className="h-full w-full" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {Array.from({ length: 4 }).map((_, r) =>
        Array.from({ length: 4 }).map((__, c) => {
          const x = c * 50 + 10;
          const y = r * 50 + 10;
          return (
            <polygon
              key={`${r}-${c}`}
              points={`${x},${y + 36} ${x + 36},${y + 36} ${x + 18},${y}`}
              fill="var(--bh-yellow)"
              stroke="var(--bh-ink)"
              strokeWidth="0.7"
              opacity="0.18"
            >
              <animate
                attributeName="opacity"
                values="0.05;0.28;0.05"
                dur={`${3 + ((r + c) % 4)}s`}
                repeatCount="indefinite"
                begin={`${(r + c) * 0.18}s`}
              />
            </polygon>
          );
        })
      )}
    </svg>
  );
}

/* ─────────────────────────── CTA ─────────────────────────── */

function CTA() {
  return (
    <section className="relative z-10 mx-auto w-full max-w-7xl px-6 py-24">
      <div className="relative overflow-hidden border border-bh-ink/80 bg-bh-ink text-bh-canvas">
        <div className="absolute inset-0 bh-grain opacity-50" />
        <div className="absolute -right-10 -top-10 h-72 w-72 rounded-full bh-anim-drift" style={{ background: "var(--bh-red)" }} />
        <div className="absolute -bottom-12 -right-32 h-80 w-80 rounded-full opacity-70 blur-2xl bh-anim-drift" style={{ background: "var(--bh-blue-bright)", animationDelay: "1s" }} />
        <svg viewBox="0 0 100 100" className="absolute -left-6 -bottom-6 h-44 w-44 bh-anim-spin-slow" aria-hidden>
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--bh-yellow)" strokeWidth="1.5" strokeDasharray="2 6" />
        </svg>
        <div className="absolute left-12 top-12 h-16 w-16 bh-anim-float-y" style={{ background: "var(--bh-yellow)" }} />

        {/* Inline mouse glow within the panel (dark variant) */}
        <div className="absolute inset-0 mix-blend-screen pointer-events-none" aria-hidden>
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(360px circle at calc(var(--mx)) calc(var(--my)), rgba(230,185,74,0.18), transparent 60%)",
            }}
          />
        </div>

        <div className="relative grid gap-12 px-10 py-16 md:grid-cols-12 md:px-16 md:py-24">
          <div className="md:col-span-8">
            <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-bh-yellow flex items-center gap-2">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-bh-yellow bh-anim-blink" />
              start here
            </span>
            <h3 className="mt-4 text-[clamp(2.2rem,5.4vw,4.6rem)] font-bold leading-[1.02] tracking-tight">
              Hire your first agent <br /> in under a minute.
            </h3>
            <p className="mt-6 max-w-lg text-bh-canvas/75">
              Open the dashboard, type a capability and a budget, and TrustGate
              ranks every live ERC-8004 agent on Base Sepolia for you.
            </p>
            <div className="mt-10 flex flex-wrap gap-4">
              <Link
                href="/dashboard"
                className="bh-btn bh-btn-glow bg-bh-yellow text-bh-ink px-6 py-3 text-sm font-semibold tracking-tight"
              >
                Launch dashboard →
              </Link>
              <a
                href="https://github.com"
                className="bh-btn-ghost px-6 py-3 text-sm font-medium tracking-tight text-bh-canvas"
                style={{ boxShadow: "inset 0 0 0 1.5px rgba(245, 241, 230, 0.85)" }}
              >
                Read the spec
              </a>
            </div>
          </div>
          <div className="hidden md:col-span-4 md:flex items-center justify-center">
            <Logogrid />
          </div>
        </div>
      </div>
    </section>
  );
}

function Logogrid() {
  return (
    <div className="relative h-60 w-60">
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-1.5">
        <div className="bg-bh-canvas/95 bh-anim-pulse-soft" />
        <div className="bg-bh-yellow" />
        <div className="bg-bh-canvas/95" />
        <div style={{ background: "var(--bh-red)" }} />
        <div className="bg-bh-canvas/95 rounded-full bh-anim-pulse-soft" />
        <div style={{ background: "var(--bh-blue-bright)" }} />
        <div className="bg-bh-canvas/95" />
        <div className="bg-bh-canvas/95 bh-anim-pulse-soft" />
        <div className="bg-bh-canvas/95" />
      </div>
      <svg viewBox="0 0 100 100" className="absolute inset-0 bh-anim-spin-slow" aria-hidden>
        <circle cx="50" cy="50" r="48" fill="none" stroke="var(--bh-canvas)" strokeWidth="0.5" strokeDasharray="1 3" />
      </svg>
      <svg viewBox="0 0 100 100" className="absolute inset-4 bh-anim-spin-rev" aria-hidden>
        <circle cx="50" cy="50" r="46" fill="none" stroke="var(--bh-yellow)" strokeWidth="0.5" strokeDasharray="1 5" />
      </svg>
    </div>
  );
}

/* ─────────────────────────── Footer ─────────────────────────── */

function Footer() {
  return (
    <footer className="relative z-10 border-t border-bh-line-strong bg-bh-canvas">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-10 px-6 py-12 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <Logomark />
          <div>
            <div className="font-semibold tracking-tight">TrustGate</div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-bh-mute">
              ethglobal openagents · 2026
            </div>
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-3 text-sm">
          <FooterCol title="Product" links={[{label:"Dashboard",href:"/dashboard"},{label:"Pipeline",href:"#pipeline"},{label:"Architecture",href:"#architecture"}]} />
          <FooterCol title="Standards" links={[{label:"ERC-8004",href:"#"},{label:"Gensyn AXL",href:"#"},{label:"Base Sepolia",href:"#"}]} />
          <FooterCol title="Repo" links={[{label:"README",href:"#"},{label:"Blueprint",href:"#"},{label:"Issues",href:"#"}]} />
        </div>
      </div>
      <div className="border-t border-bh-line-strong">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 font-mono text-[11px] uppercase tracking-widest text-bh-mute">
          <span>read-only · live base sepolia</span>
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-bh-red bh-anim-blink" />
            built in public
          </span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: { label: string; href: string }[] }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-bh-mute">{title}</div>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className="hover:text-bh-red transition-colors">{l.label}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

function SectionHeader({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <div className="grid gap-8 md:grid-cols-12">
      <div className="md:col-span-5">
        <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.35em] text-bh-mute">
          <span className="inline-block h-3 w-3 bg-bh-ink" />
          {eyebrow}
        </div>
        <h2 className="mt-4 text-[clamp(2rem,4.4vw,3.4rem)] font-bold leading-[1.04] tracking-tight">
          {title}
        </h2>
      </div>
      <p className="md:col-span-6 md:col-start-7 text-base leading-relaxed text-bh-ink-soft md:self-end">
        {body}
      </p>
    </div>
  );
}
