"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Animated architecture diagram. SVG box-and-arrow with:
 *  - data particles flowing along each connection (animateMotion)
 *  - pulsing status dots on every node
 *  - a live activity ticker overlay showing simulated events
 */
export function FlowDiagram() {
  const [events, setEvents] = useState<string[]>([
    "00:01.04  → /api/find-best-agent  capability=defi",
    "00:01.21  registry  hydrate cards (24)",
    "00:01.38  scorer    rank candidates 0.49 / 0.41 / 0.32",
  ]);

  useEffect(() => {
    const lines = [
      "axl/n1   → routed to n2",
      "axl/n2   delivered (a2a)",
      "worker   reply  62ms",
      "keeperhub settle  USDC 0.50",
      "registry giveFeedback  tx pending",
      "registry receipt  block 36400122",
      "scorer   re-rank  fallback runner-up",
      "axl/n3   peered  ok",
      "ens      forward resolve  tx.eth",
      "/api/agents  hit cache  4ms",
    ];
    let i = 0;
    const id = setInterval(() => {
      const stamp = `00:0${(2 + Math.floor(i * 0.7)) % 9}.${String(
        Math.floor(Math.random() * 90) + 10
      )}`;
      const line = `${stamp}  ${lines[i % lines.length]}`;
      setEvents((prev) => [line, ...prev].slice(0, 5));
      i++;
    }, 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative aspect-[7/6] w-full border border-bh-line-strong bg-bh-canvas overflow-hidden">
      <div className="absolute inset-0 bh-grid-fine opacity-50" />
      <div className="absolute inset-0 bh-grain-fine" />

      {/* faint orbit gradient */}
      <div
        className="absolute -inset-10 opacity-50 blur-3xl"
        style={{
          background:
            "radial-gradient(40% 60% at 30% 25%, rgba(74,104,189,0.18), transparent), radial-gradient(40% 60% at 80% 70%, rgba(230,185,74,0.18), transparent)",
        }}
      />

      <svg viewBox="0 0 700 600" className="relative h-full w-full">
        <defs>
          <marker
            id="arrow-soft"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L9,3 z" fill="var(--bh-ink-soft)" />
          </marker>

          {/* per-path id'd paths so we can reference them in animateMotion */}
          <path id="p-dash-api" d="M150,120 L150,178" />
          <path id="p-api-reg" d="M150,260 L150,318" />
          <path id="p-api-axl" d="M260,220 L378,220" />
          <path id="p-axl-mesh" d="M500,260 L500,332" />
          <path id="p-mesh-worker" d="M540,406 L540,498" />
        </defs>

        {/* Connections */}
        <Connection d="M150,120 L150,178" label="CORS" labelAt={[160, 152]} />
        <Connection d="M150,260 L150,318" label="eth_call" labelAt={[160, 295]} />
        <Connection d="M260,220 L378,220" label="json" labelAt={[300, 210]} />
        <Connection
          d="M500,260 L500,332"
          dash="3 4"
          label="grpc · tls"
          labelAt={[510, 305]}
        />
        <Connection d="M540,406 L540,498" label="a2a json-rpc" labelAt={[552, 460]} />

        {/* Boxes */}
        <Box
          x={40}
          y={40}
          w={220}
          h={80}
          fill="var(--bh-canvas-deep)"
          title="Next.js dashboard"
          sub=":3000  /dashboard"
          accent="var(--bh-blue-bright)"
        />
        <Box
          x={40}
          y={180}
          w={220}
          h={80}
          fill="var(--bh-yellow-soft)"
          title="Flask API · server.py"
          sub="/api/*  ·  :8000"
          accent="var(--bh-yellow)"
        />
        <Box
          x={40}
          y={320}
          w={220}
          h={100}
          fill="var(--bh-canvas-deep)"
          title="web3.py"
          sub="IdentityRegistry · ReputationRegistry"
          subSub="base sepolia"
          accent="var(--bh-blue)"
        />
        <Box
          x={380}
          y={180}
          w={240}
          h={80}
          fill="var(--bh-canvas-deep)"
          title="AXL gateway"
          sub="/send  /recv  /topology"
          accent="var(--bh-blue-bright)"
        />

        {/* Mesh nodes */}
        <MeshNode cx={430} cy={370} fill="var(--bh-blue)" label="n1" />
        <MeshNode
          cx={540}
          cy={370}
          fill="var(--bh-blue-bright)"
          label="n2"
          highlight
        />
        <MeshNode cx={650} cy={370} fill="var(--bh-blue)" label="n3" />
        <line x1="466" y1="370" x2="504" y2="370" stroke="var(--bh-ink-soft)" strokeWidth="1.2" />
        <line x1="576" y1="370" x2="614" y2="370" stroke="var(--bh-ink-soft)" strokeWidth="1.2" />

        {/* Worker triangle */}
        <g>
          <polygon
            points="540,500 620,560 460,560"
            fill="var(--bh-red)"
            stroke="var(--bh-ink-soft)"
            strokeWidth="1.2"
          />
          <text
            x="540"
            y="546"
            textAnchor="middle"
            fontFamily="ui-monospace, monospace"
            fontSize="11"
            fill="var(--bh-canvas)"
          >
            worker
          </text>
          <circle cx="540" cy="540" r="3" fill="var(--bh-yellow)">
            <animate
              attributeName="opacity"
              values="0.4;1;0.4"
              dur="1.6s"
              repeatCount="indefinite"
            />
          </circle>
        </g>

        {/* ── Flowing data particles ───────────── */}
        <Particle pathId="#p-dash-api" color="var(--bh-blue-bright)" dur="2.4s" />
        <Particle pathId="#p-dash-api" color="var(--bh-yellow)" dur="2.4s" begin="0.8s" />

        <Particle pathId="#p-api-reg" color="var(--bh-yellow)" dur="2.6s" />
        <Particle pathId="#p-api-reg" color="var(--bh-blue)" dur="2.6s" begin="1.0s" />

        <Particle pathId="#p-api-axl" color="var(--bh-yellow)" dur="2.0s" />
        <Particle pathId="#p-api-axl" color="var(--bh-red)" dur="2.0s" begin="0.6s" />
        <Particle pathId="#p-api-axl" color="var(--bh-ink)" dur="2.0s" begin="1.2s" />

        <Particle pathId="#p-axl-mesh" color="var(--bh-blue-bright)" dur="2.2s" />
        <Particle pathId="#p-axl-mesh" color="var(--bh-yellow)" dur="2.2s" begin="0.9s" />

        <Particle pathId="#p-mesh-worker" color="var(--bh-red)" dur="2.6s" />
        <Particle pathId="#p-mesh-worker" color="var(--bh-yellow)" dur="2.6s" begin="1.1s" />

        {/* mesh-internal pulsing line */}
        <g>
          <circle cx="466" cy="370" r="2.5" fill="var(--bh-yellow)">
            <animate
              attributeName="cx"
              values="466;504;466"
              dur="2.2s"
              repeatCount="indefinite"
            />
          </circle>
          <circle cx="576" cy="370" r="2.5" fill="var(--bh-yellow)">
            <animate
              attributeName="cx"
              values="576;614;576"
              dur="2.4s"
              repeatCount="indefinite"
            />
          </circle>
        </g>
      </svg>

      {/* corner badge */}
      <div className="absolute top-3 right-3 font-mono text-[10px] uppercase tracking-[0.3em] text-bh-mute flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-bh-red bh-anim-blink" />
        diagram · 01 · live
      </div>

      {/* Activity feed overlay */}
      <div className="absolute bottom-3 left-3 right-3 max-w-md border border-bh-line-strong bg-bh-canvas/90 backdrop-blur-sm p-3 font-mono text-[10px] leading-relaxed text-bh-ink-soft">
        <div className="flex items-center justify-between text-[9px] uppercase tracking-[0.35em] text-bh-mute mb-1.5">
          <span>activity ▸ stream</span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-bh-red bh-anim-blink" />
            tail -f
          </span>
        </div>
        <ul className="space-y-0.5">
          {events.map((line, i) => (
            <li
              key={`${i}-${line}`}
              className={
                "truncate transition-opacity " +
                (i === 0 ? "text-bh-ink" : "opacity-" + Math.max(60 - i * 12, 30))
              }
              style={{ opacity: 1 - i * 0.18 }}
            >
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Connection({
  d,
  label,
  labelAt,
  dash,
}: {
  d: string;
  label?: string;
  labelAt?: [number, number];
  dash?: string;
}) {
  return (
    <g>
      <path
        d={d}
        stroke="var(--bh-ink-soft)"
        strokeWidth="1.2"
        fill="none"
        strokeDasharray={dash}
        markerEnd="url(#arrow-soft)"
      />
      {label && labelAt && (
        <text
          x={labelAt[0]}
          y={labelAt[1]}
          fontFamily="ui-monospace, monospace"
          fontSize="10"
          fill="var(--bh-mute)"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function Box({
  x,
  y,
  w,
  h,
  fill,
  title,
  sub,
  subSub,
  accent,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  title: string;
  sub: string;
  subSub?: string;
  accent: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke="var(--bh-ink-soft)" strokeWidth="1.4" />
      {/* status dot */}
      <circle cx={x + 10} cy={y + 10} r="3" fill={accent}>
        <animate attributeName="opacity" values="0.4;1;0.4" dur="1.8s" repeatCount="indefinite" />
      </circle>
      <text
        x={x + w / 2}
        y={y + 34}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize="13"
        fill="var(--bh-ink)"
      >
        {title}
      </text>
      <text
        x={x + w / 2}
        y={y + 54}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize="10"
        fill="var(--bh-mute)"
      >
        {sub}
      </text>
      {subSub && (
        <text
          x={x + w / 2}
          y={y + 70}
          textAnchor="middle"
          fontFamily="ui-monospace, monospace"
          fontSize="10"
          fill="var(--bh-mute)"
        >
          {subSub}
        </text>
      )}

      {/* decorative mini-bars in the box bottom */}
      <g>
        {Array.from({ length: 6 }).map((_, i) => (
          <rect
            key={i}
            x={x + 12 + i * 8}
            y={y + h - 10}
            width="3"
            height="4"
            fill={accent}
            opacity={0.35 + (i % 3) * 0.2}
          >
            <animate
              attributeName="height"
              values={`4;${4 + ((i * 3) % 8)};4`}
              dur={`${1.2 + (i % 3) * 0.4}s`}
              repeatCount="indefinite"
            />
            <animate
              attributeName="y"
              values={`${y + h - 10};${y + h - 10 - ((i * 3) % 8)};${y + h - 10}`}
              dur={`${1.2 + (i % 3) * 0.4}s`}
              repeatCount="indefinite"
            />
          </rect>
        ))}
      </g>
    </g>
  );
}

function MeshNode({
  cx,
  cy,
  fill,
  label,
  highlight,
}: {
  cx: number;
  cy: number;
  fill: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <g>
      {highlight && (
        <circle cx={cx} cy={cy} r="36" fill="none" stroke={fill} strokeWidth="1">
          <animate attributeName="r" values="36;52;36" dur="2.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0;0.6" dur="2.6s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx={cx} cy={cy} r="36" fill={fill} stroke="var(--bh-ink-soft)" strokeWidth="1.4" />
      <text
        x={cx}
        y={cy + 5}
        textAnchor="middle"
        fontFamily="ui-monospace, monospace"
        fontSize="11"
        fill="var(--bh-canvas)"
      >
        {label}
      </text>
    </g>
  );
}

function Particle({
  pathId,
  color,
  dur,
  begin = "0s",
  r = 3,
}: {
  pathId: string;
  color: string;
  dur: string;
  begin?: string;
  r?: number;
}) {
  return (
    <circle r={r} fill={color}>
      <animateMotion dur={dur} repeatCount="indefinite" begin={begin}>
        <mpath href={pathId} />
      </animateMotion>
      <animate
        attributeName="opacity"
        values="0;1;1;0"
        keyTimes="0;0.1;0.9;1"
        dur={dur}
        repeatCount="indefinite"
        begin={begin}
      />
    </circle>
  );
}
