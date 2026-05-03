"use client";

import { useEffect, useState } from "react";
import {
  api,
  type AxlA2AResult,
  type AxlSendJobResult,
  type AxlTopology,
  type HireResult,
} from "@/lib/api";
import { TabHeader } from "./TabHeader";
import { Tooltip } from "./Tooltip";

function shortPk(pk: string) {
  return pk ? `${pk.slice(0, 16)}…${pk.slice(-6)}` : "";
}

function NodeCard({
  label,
  port,
  topo,
  loading,
}: {
  label: string;
  port: number;
  topo: AxlTopology | null;
  loading: boolean;
}) {
  const t = topo?.topology;
  return (
    <div className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-bh-mute-2">{label}</div>
          <div className="text-base font-medium">localhost:{port}</div>
        </div>
        <div
          className={
            "h-2 w-2 rounded-full " +
            (loading ? "animate-pulse bg-bh-mute-2" : t ? "bg-bh-blue-bright" : "bg-bh-red")
          }
        />
      </div>
      {topo?.error ? (
        <div className="mt-3 rounded bg-bh-red/10 p-2 text-xs text-bh-red">{topo.error}</div>
      ) : t ? (
        <dl className="mt-3 space-y-1.5 text-xs">
          <div>
            <dt className="text-bh-mute-2">pubkey</dt>
            <dd className="break-all font-mono text-bh-blue">{shortPk(t.our_public_key)}</dd>
          </div>
          <div>
            <dt className="text-bh-mute-2">peers</dt>
            <dd className="text-bh-ink-soft">{t.peers.length}</dd>
          </div>
        </dl>
      ) : (
        <div className="mt-3 text-xs text-bh-mute-2">{loading ? "Loading…" : "no data"}</div>
      )}
    </div>
  );
}

export function AxlTab() {
  const [aPort, setAPort] = useState(9002);
  const [bPort, setBPort] = useState(9012);
  const [cPort, setCPort] = useState(9022);
  const [topoA, setTopoA] = useState<AxlTopology | null>(null);
  const [topoB, setTopoB] = useState<AxlTopology | null>(null);
  const [topoC, setTopoC] = useState<AxlTopology | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Phase 1 raw send-job
  const [task, setTask] = useState("uppercase_text");
  const [input, setInput] = useState("trustgate axl ok");
  const [phase1Timeout, setPhase1Timeout] = useState(30);
  const [phase1Running, setPhase1Running] = useState(false);
  const [phase1Result, setPhase1Result] = useState<AxlSendJobResult | null>(null);

  // Phase 4 A2A direct call
  const [a2aPeer, setA2aPeer] = useState("");
  const [a2aService, setA2aService] = useState("uppercase_text");
  const [a2aInput, setA2aInput] = useState("phase 4 ok");
  const [a2aTimeout, setA2aTimeout] = useState(10);
  const [a2aRunning, setA2aRunning] = useState(false);
  const [a2aResult, setA2aResult] = useState<AxlA2AResult | null>(null);

  // Phase 4 hire-with-fallback (uses both workers)
  const [hireService, setHireService] = useState("uppercase_text");
  const [hireInput, setHireInput] = useState("hire via dashboard");
  const [hireTimeout, setHireTimeout] = useState(5);
  const [hireBOrder, setHireBOrder] = useState<"b-first" | "c-first">("b-first");
  const [hireRunning, setHireRunning] = useState(false);
  const [hireResult, setHireResult] = useState<HireResult | null>(null);

  async function refreshTopology() {
    setLoading(true);
    setErr(null);
    try {
      const [a, b, c] = await Promise.all([
        api.axlTopology(aPort),
        api.axlTopology(bPort),
        api.axlTopology(cPort),
      ]);
      setTopoA(a);
      setTopoB(b);
      setTopoC(c);
      // pre-fill the A2A peer field with worker-b
      if (b.topology?.our_public_key && !a2aPeer) {
        setA2aPeer(b.topology.our_public_key);
      }
    } catch (e) {
      setErr(`${(e as Error).message || e}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshTopology();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function sendPhase1(e?: React.FormEvent) {
    e?.preventDefault();
    setPhase1Running(true);
    setPhase1Result(null);
    setErr(null);
    try {
      const r = await api.axlSendJob({ a_port: aPort, b_port: bPort, task, input, timeout: phase1Timeout });
      setPhase1Result(r);
    } catch (e) {
      setErr(`${(e as Error).message || e}`);
    } finally {
      setPhase1Running(false);
    }
  }

  async function sendA2A(e?: React.FormEvent) {
    e?.preventDefault();
    setA2aRunning(true);
    setA2aResult(null);
    setErr(null);
    try {
      const r = await api.axlA2A({
        peer: a2aPeer,
        service: a2aService,
        input: a2aInput,
        api_port: aPort,
        timeout: a2aTimeout,
      });
      setA2aResult(r);
    } catch (e) {
      setErr(`${(e as Error).message || e}`);
    } finally {
      setA2aRunning(false);
    }
  }

  async function runHire(e?: React.FormEvent) {
    e?.preventDefault();
    if (!topoB?.topology || !topoC?.topology) {
      setErr("Need both worker-b and worker-c online to demonstrate fallback");
      return;
    }
    setHireRunning(true);
    setHireResult(null);
    setErr(null);
    const bPk = topoB.topology.our_public_key;
    const cPk = topoC.topology.our_public_key;
    const ordered =
      hireBOrder === "b-first"
        ? [
            { agent_id: -1, name: "worker-b (rep 0.95)", axl_pubkey: bPk, endpoints: [{ name: "axl", endpoint: bPk }] },
            { agent_id: -1, name: "worker-c (rep 0.80)", axl_pubkey: cPk, endpoints: [{ name: "axl", endpoint: cPk }] },
          ]
        : [
            { agent_id: -1, name: "worker-c (rep 0.95)", axl_pubkey: cPk, endpoints: [{ name: "axl", endpoint: cPk }] },
            { agent_id: -1, name: "worker-b (rep 0.80)", axl_pubkey: bPk, endpoints: [{ name: "axl", endpoint: bPk }] },
          ];
    try {
      const r = await api.hire({
        capability: "phase4-demo",
        service: hireService,
        input: hireInput,
        candidates: [],
        extra_candidates: ordered,
        a2a_timeout: hireTimeout,
        api_port: aPort,
      });
      setHireResult(r);
    } catch (e) {
      setErr(`${(e as Error).message || e}`);
    } finally {
      setHireRunning(false);
    }
  }

  // Friendly mesh diagram: three dots, lines from n1 to each worker. Live
  // dots when topology fetched, grey when not. Skips when nothing's loaded.
  const meshReady = !!(topoA?.topology && topoB?.topology && topoC?.topology);

  return (
    <div className="space-y-6">
      <TabHeader
        eyebrow="04 · axl bridge"
        title="The peer-to-peer mesh"
        subtitle="Three local Gensyn AXL nodes peered together. n1 is TrustGate's outbound. n2 + n3 host the workers. Watch a hire-with-fallback flow run end-to-end across the mesh."
        glyph="square"
        glyphColor="var(--bh-blue-bright)"
      />

      <section className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-bh-ink-soft">
              What you&apos;re looking at:{" "}
              <Tooltip text="Gensyn AXL is a peer-to-peer mesh between agent nodes. The Go binary speaks TLS over a virtual gVisor network and exposes a localhost HTTP bridge per node. TrustGate routes every job over this mesh — there is no central coordinator.">
                AXL
              </Tooltip>{" "}
              mesh
            </h3>
            <p className="mt-1 text-xs text-bh-mute-2">
              n1 is TrustGate (sender). n2 + n3 host the workers. Job traffic crosses the mesh
              from n1 → worker; results come back the same way.
            </p>
          </div>
          {/* tiny SVG mesh diagram — three nodes, two lines */}
          <svg viewBox="0 0 220 80" className="h-16 shrink-0">
            {/* lines */}
            <line x1="40" y1="40" x2="110" y2="40" stroke={meshReady ? "var(--bh-blue-bright)" : "var(--bh-mute-2)"} strokeWidth="1.5" />
            <line x1="40" y1="40" x2="180" y2="40" stroke={meshReady ? "var(--bh-blue-bright)" : "var(--bh-mute-2)"} strokeWidth="1.5" />
            {/* nodes */}
            <g>
              <circle cx="40" cy="40" r="10" fill={topoA?.topology ? "var(--bh-blue-bright)" : "var(--bh-mute-2)"} stroke="var(--bh-ink-soft)" strokeWidth="1" />
              <text x="40" y="68" textAnchor="middle" className="fill-bh-mute" fontSize="10">n1</text>
            </g>
            <g>
              <circle cx="110" cy="40" r="8" fill={topoB?.topology ? "var(--bh-blue-bright)" : "var(--bh-mute-2)"} stroke="var(--bh-ink-soft)" strokeWidth="1" />
              <text x="110" y="68" textAnchor="middle" className="fill-bh-mute" fontSize="10">n2</text>
            </g>
            <g>
              <circle cx="180" cy="40" r="8" fill={topoC?.topology ? "var(--bh-blue-bright)" : "var(--bh-mute-2)"} stroke="var(--bh-ink-soft)" strokeWidth="1" />
              <text x="180" y="68" textAnchor="middle" className="fill-bh-mute" fontSize="10">n3</text>
            </g>
          </svg>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-bh-mute">Local AXL nodes</h2>
          <div className="flex items-center gap-2 text-xs">
            <input
              type="number"
              value={aPort}
              onChange={(e) => setAPort(Number(e.target.value))}
              className="w-20 rounded border border-bh-line-strong bg-bh-canvas px-2 py-1"
            />
            <span className="text-bh-mute-2">·</span>
            <input
              type="number"
              value={bPort}
              onChange={(e) => setBPort(Number(e.target.value))}
              className="w-20 rounded border border-bh-line-strong bg-bh-canvas px-2 py-1"
            />
            <span className="text-bh-mute-2">·</span>
            <input
              type="number"
              value={cPort}
              onChange={(e) => setCPort(Number(e.target.value))}
              className="w-20 rounded border border-bh-line-strong bg-bh-canvas px-2 py-1"
            />
            <button onClick={refreshTopology} className="rounded bg-bh-paper-soft px-2 py-1 hover:bg-bh-paper-soft">
              Refresh
            </button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <NodeCard label="n1 — TrustGate (sender)" port={aPort} topo={topoA} loading={loading} />
          <NodeCard label="n2 — worker-b" port={bPort} topo={topoB} loading={loading} />
          <NodeCard label="n3 — worker-c (fallback)" port={cPort} topo={topoC} loading={loading} />
        </div>
        {err && (
          <div className="mt-3 rounded border border-bh-red/40 bg-bh-red/10 p-3 text-xs text-bh-red">
            {err}
            <div className="mt-1 text-bh-red/70">
              Bring up the stack with{" "}
              <code className="rounded bg-bh-paper px-1">bash scripts/start_axl_nodes.sh</code> in WSL,
              then <code className="rounded bg-bh-paper px-1">app/phase4_worker.py --port 9014</code>{" "}
              and <code className="rounded bg-bh-paper px-1">app/phase4_worker.py --port 9024</code>.
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-medium text-bh-mute">Phase 4 · Hire-with-fallback (find_best_agent → A2A → retry)</h2>
        </div>
        <p className="mb-3 text-xs text-bh-mute-2">
          Sends the task to the higher-ranked candidate first. If it doesn&apos;t reply within{" "}
          <code className="rounded bg-bh-paper-soft px-1">a2a_timeout</code> seconds, the orchestrator falls
          back to the runner-up. Use the start script flag <code className="rounded bg-bh-paper-soft px-1">--drop-first 1</code>{" "}
          on whichever worker should drop the first request to demonstrate the fallback.
        </p>
        <form onSubmit={runHire} className="grid gap-3 md:grid-cols-4">
          <label className="text-xs">
            <span className="text-bh-mute-2">service</span>
            <select
              value={hireService}
              onChange={(e) => setHireService(e.target.value)}
              className="mt-1 w-full rounded border border-bh-line-strong bg-bh-canvas px-2 py-1.5 text-sm"
            >
              <option value="uppercase_text">uppercase_text</option>
              <option value="summarise_documents">summarise_documents</option>
              <option value="sleep_then_succeed">sleep_then_succeed</option>
              <option value="drop">drop (will always time out)</option>
            </select>
          </label>
          <label className="text-xs md:col-span-2">
            <span className="text-bh-mute-2">input</span>
            <input
              value={hireInput}
              onChange={(e) => setHireInput(e.target.value)}
              className="mt-1 w-full rounded border border-bh-line-strong bg-bh-canvas px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="text-xs">
            <span className="text-bh-mute-2">a2a_timeout (s)</span>
            <input
              type="number"
              value={hireTimeout}
              onChange={(e) => setHireTimeout(Number(e.target.value))}
              className="mt-1 w-full rounded border border-bh-line-strong bg-bh-canvas px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs md:col-span-2">
            <span className="text-bh-mute-2">candidate order</span>
            <div className="mt-1 flex gap-3 text-bh-ink-soft">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={hireBOrder === "b-first"}
                  onChange={() => setHireBOrder("b-first")}
                  className="accent-bh-blue-bright"
                />
                worker-b first (then c)
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={hireBOrder === "c-first"}
                  onChange={() => setHireBOrder("c-first")}
                  className="accent-bh-blue-bright"
                />
                worker-c first (then b)
              </label>
            </div>
          </label>
          <div className="md:col-span-2 flex items-end justify-end">
            <button
              type="submit"
              disabled={hireRunning}
              className="rounded bg-bh-blue-bright/25 px-3 py-1.5 text-sm text-bh-blue ring-1 ring-bh-blue-bright/40 hover:bg-bh-blue-bright/40 disabled:opacity-40"
            >
              {hireRunning ? "Running…" : "Run hire-with-fallback"}
            </button>
          </div>
        </form>

        {hireResult && (
          <div className="mt-4 space-y-2">
            {hireResult.attempts.map((a, i) => {
              const cand = a.candidate as { name?: string; axl_pubkey?: string };
              return (
                <div
                  key={i}
                  className={
                    "rounded border p-3 text-xs " +
                    (a.ok
                      ? "border-bh-blue-bright/40 bg-bh-blue-bright/10"
                      : "border-bh-red/40/60 bg-bh-red/10")
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-bh-ink">
                      attempt {i + 1}: {cand.name || "(unknown)"}
                    </span>
                    <span className={a.ok ? "text-bh-blue" : "text-bh-red"}>
                      {a.ok ? "✓ delivered" : "✗ " + (a.error || "failed")} ·{" "}
                      <span className="tabular-nums">{a.elapsed_seconds.toFixed(2)}s</span>
                    </span>
                  </div>
                  {cand.axl_pubkey && (
                    <div className="mt-1 break-all font-mono text-[10px] text-bh-mute-2">
                      {cand.axl_pubkey}
                    </div>
                  )}
                  {a.ok && a.reply && (
                    <pre className="mt-2 overflow-auto rounded bg-bh-canvas p-2 text-[11px] text-bh-ink-soft">
                      {JSON.stringify(a.reply, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
            {hireResult.final_reply && (
              <div className="rounded border border-bh-blue-bright/40 bg-bh-blue-bright/10 p-3 text-xs text-bh-blue">
                Final reply (winner: candidate index {hireResult.winner_index}) —
                <pre className="mt-1 overflow-auto rounded bg-bh-canvas p-2 text-[11px] text-bh-ink-soft">
                  {JSON.stringify(hireResult.final_reply, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-5">
        <h2 className="mb-3 text-sm font-medium text-bh-mute">Phase 4 · Direct A2A SendMessage</h2>
        <form onSubmit={sendA2A} className="grid gap-3 md:grid-cols-3">
          <label className="text-xs md:col-span-2">
            <span className="text-bh-mute-2">peer (64-char hex pubkey)</span>
            <input
              value={a2aPeer}
              onChange={(e) => setA2aPeer(e.target.value)}
              className="mt-1 w-full rounded border border-bh-line-strong bg-bh-canvas px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="text-xs">
            <span className="text-bh-mute-2">service</span>
            <select
              value={a2aService}
              onChange={(e) => setA2aService(e.target.value)}
              className="mt-1 w-full rounded border border-bh-line-strong bg-bh-canvas px-2 py-1.5 text-sm"
            >
              <option value="uppercase_text">uppercase_text</option>
              <option value="summarise_documents">summarise_documents</option>
              <option value="sleep_then_succeed">sleep_then_succeed</option>
              <option value="drop">drop</option>
            </select>
          </label>
          <label className="text-xs md:col-span-2">
            <span className="text-bh-mute-2">input</span>
            <input
              value={a2aInput}
              onChange={(e) => setA2aInput(e.target.value)}
              className="mt-1 w-full rounded border border-bh-line-strong bg-bh-canvas px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="text-xs">
            <span className="text-bh-mute-2">timeout (s)</span>
            <input
              type="number"
              value={a2aTimeout}
              onChange={(e) => setA2aTimeout(Number(e.target.value))}
              className="mt-1 w-full rounded border border-bh-line-strong bg-bh-canvas px-2 py-1.5 text-sm"
            />
          </label>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={a2aRunning || !a2aPeer}
              className="rounded bg-bh-blue-bright/25 px-3 py-1.5 text-sm text-bh-blue ring-1 ring-bh-blue-bright/40 hover:bg-bh-blue-bright/40 disabled:opacity-40"
            >
              {a2aRunning ? "Sending…" : "Send A2A"}
            </button>
          </div>
        </form>
        {a2aResult && (
          <pre className="mt-3 max-h-72 overflow-auto rounded border border-bh-line-strong bg-bh-canvas p-3 text-[11px] text-bh-ink-soft">
            {JSON.stringify(a2aResult, null, 2)}
          </pre>
        )}
      </section>

      <section className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-5">
        <h2 className="mb-3 text-sm font-medium text-bh-mute">Phase 1 · Raw send-job (legacy)</h2>
        <form onSubmit={sendPhase1} className="grid gap-3 md:grid-cols-3">
          <label className="text-xs">
            <span className="text-bh-mute-2">task</span>
            <select
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className="mt-1 w-full rounded border border-bh-line-strong bg-bh-canvas px-2 py-1.5 text-sm"
            >
              <option value="uppercase_text">uppercase_text</option>
              <option value="summarise_documents">summarise_documents</option>
            </select>
          </label>
          <label className="text-xs md:col-span-2">
            <span className="text-bh-mute-2">input</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="mt-1 w-full rounded border border-bh-line-strong bg-bh-canvas px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="text-xs">
            <span className="text-bh-mute-2">timeout (s)</span>
            <input
              type="number"
              value={phase1Timeout}
              onChange={(e) => setPhase1Timeout(Number(e.target.value))}
              className="mt-1 w-24 rounded border border-bh-line-strong bg-bh-canvas px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex items-end md:col-span-2 justify-end">
            <button
              type="submit"
              disabled={phase1Running}
              className="rounded bg-bh-paper-soft px-3 py-1.5 text-sm text-bh-ink ring-1 ring-bh-line-strong hover:bg-bh-paper-soft disabled:opacity-40"
            >
              {phase1Running ? "Sending…" : "Send raw /send + /recv"}
            </button>
          </div>
        </form>
        <p className="mt-2 text-[11px] text-bh-mute-2">
          The Phase 1 path expects the original <code>agent_b_mock.py</code> polling /recv on n2&apos;s
          bridge — it&apos;s preserved for backwards compat but the Phase 4 A2A flow above is the one that
          actually goes through AXL&apos;s structured envelope.
        </p>
        {phase1Result && (
          <pre className="mt-3 max-h-60 overflow-auto rounded border border-bh-line-strong bg-bh-canvas p-3 text-[11px] text-bh-ink-soft">
            {JSON.stringify(phase1Result, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
