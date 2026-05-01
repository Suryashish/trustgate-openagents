"use client";

import { useEffect, useState } from "react";
import {
  api,
  type AxlA2AResult,
  type AxlSendJobResult,
  type AxlTopology,
  type HireResult,
} from "@/lib/api";

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
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
          <div className="text-base font-medium">localhost:{port}</div>
        </div>
        <div
          className={
            "h-2 w-2 rounded-full " +
            (loading ? "animate-pulse bg-zinc-500" : t ? "bg-emerald-400" : "bg-rose-500")
          }
        />
      </div>
      {topo?.error ? (
        <div className="mt-3 rounded bg-rose-950/40 p-2 text-xs text-rose-300">{topo.error}</div>
      ) : t ? (
        <dl className="mt-3 space-y-1.5 text-xs">
          <div>
            <dt className="text-zinc-500">pubkey</dt>
            <dd className="break-all font-mono text-emerald-300">{shortPk(t.our_public_key)}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">peers</dt>
            <dd className="text-zinc-300">{t.peers.length}</dd>
          </div>
        </dl>
      ) : (
        <div className="mt-3 text-xs text-zinc-500">{loading ? "Loading…" : "no data"}</div>
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

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-400">Local AXL nodes</h2>
          <div className="flex items-center gap-2 text-xs">
            <input
              type="number"
              value={aPort}
              onChange={(e) => setAPort(Number(e.target.value))}
              className="w-20 rounded border border-zinc-800 bg-zinc-950 px-2 py-1"
            />
            <span className="text-zinc-600">·</span>
            <input
              type="number"
              value={bPort}
              onChange={(e) => setBPort(Number(e.target.value))}
              className="w-20 rounded border border-zinc-800 bg-zinc-950 px-2 py-1"
            />
            <span className="text-zinc-600">·</span>
            <input
              type="number"
              value={cPort}
              onChange={(e) => setCPort(Number(e.target.value))}
              className="w-20 rounded border border-zinc-800 bg-zinc-950 px-2 py-1"
            />
            <button onClick={refreshTopology} className="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700">
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
          <div className="mt-3 rounded border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">
            {err}
            <div className="mt-1 text-rose-300/70">
              Bring up the stack with{" "}
              <code className="rounded bg-zinc-900 px-1">bash scripts/start_axl_nodes.sh</code> in WSL,
              then <code className="rounded bg-zinc-900 px-1">app/phase4_worker.py --port 9014</code>{" "}
              and <code className="rounded bg-zinc-900 px-1">app/phase4_worker.py --port 9024</code>.
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-medium text-zinc-400">Phase 4 · Hire-with-fallback (find_best_agent → A2A → retry)</h2>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          Sends the task to the higher-ranked candidate first. If it doesn&apos;t reply within{" "}
          <code className="rounded bg-zinc-800 px-1">a2a_timeout</code> seconds, the orchestrator falls
          back to the runner-up. Use the start script flag <code className="rounded bg-zinc-800 px-1">--drop-first 1</code>{" "}
          on whichever worker should drop the first request to demonstrate the fallback.
        </p>
        <form onSubmit={runHire} className="grid gap-3 md:grid-cols-4">
          <label className="text-xs">
            <span className="text-zinc-500">service</span>
            <select
              value={hireService}
              onChange={(e) => setHireService(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
            >
              <option value="uppercase_text">uppercase_text</option>
              <option value="summarise_documents">summarise_documents</option>
              <option value="sleep_then_succeed">sleep_then_succeed</option>
              <option value="drop">drop (will always time out)</option>
            </select>
          </label>
          <label className="text-xs md:col-span-2">
            <span className="text-zinc-500">input</span>
            <input
              value={hireInput}
              onChange={(e) => setHireInput(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="text-xs">
            <span className="text-zinc-500">a2a_timeout (s)</span>
            <input
              type="number"
              value={hireTimeout}
              onChange={(e) => setHireTimeout(Number(e.target.value))}
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
            />
          </label>
          <label className="text-xs md:col-span-2">
            <span className="text-zinc-500">candidate order</span>
            <div className="mt-1 flex gap-3 text-zinc-300">
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={hireBOrder === "b-first"}
                  onChange={() => setHireBOrder("b-first")}
                  className="accent-emerald-500"
                />
                worker-b first (then c)
              </label>
              <label className="flex items-center gap-1.5">
                <input
                  type="radio"
                  checked={hireBOrder === "c-first"}
                  onChange={() => setHireBOrder("c-first")}
                  className="accent-emerald-500"
                />
                worker-c first (then b)
              </label>
            </div>
          </label>
          <div className="md:col-span-2 flex items-end justify-end">
            <button
              type="submit"
              disabled={hireRunning}
              className="rounded bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30 disabled:opacity-40"
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
                      ? "border-emerald-500/40 bg-emerald-500/5"
                      : "border-rose-900/60 bg-rose-950/30")
                  }
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-200">
                      attempt {i + 1}: {cand.name || "(unknown)"}
                    </span>
                    <span className={a.ok ? "text-emerald-300" : "text-rose-300"}>
                      {a.ok ? "✓ delivered" : "✗ " + (a.error || "failed")} ·{" "}
                      <span className="tabular-nums">{a.elapsed_seconds.toFixed(2)}s</span>
                    </span>
                  </div>
                  {cand.axl_pubkey && (
                    <div className="mt-1 break-all font-mono text-[10px] text-zinc-500">
                      {cand.axl_pubkey}
                    </div>
                  )}
                  {a.ok && a.reply && (
                    <pre className="mt-2 overflow-auto rounded bg-zinc-950 p-2 text-[11px] text-zinc-300">
                      {JSON.stringify(a.reply, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
            {hireResult.final_reply && (
              <div className="rounded border border-emerald-500/40 bg-emerald-500/5 p-3 text-xs text-emerald-200">
                Final reply (winner: candidate index {hireResult.winner_index}) —
                <pre className="mt-1 overflow-auto rounded bg-zinc-950 p-2 text-[11px] text-zinc-300">
                  {JSON.stringify(hireResult.final_reply, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-3 text-sm font-medium text-zinc-400">Phase 4 · Direct A2A SendMessage</h2>
        <form onSubmit={sendA2A} className="grid gap-3 md:grid-cols-3">
          <label className="text-xs md:col-span-2">
            <span className="text-zinc-500">peer (64-char hex pubkey)</span>
            <input
              value={a2aPeer}
              onChange={(e) => setA2aPeer(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="text-xs">
            <span className="text-zinc-500">service</span>
            <select
              value={a2aService}
              onChange={(e) => setA2aService(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
            >
              <option value="uppercase_text">uppercase_text</option>
              <option value="summarise_documents">summarise_documents</option>
              <option value="sleep_then_succeed">sleep_then_succeed</option>
              <option value="drop">drop</option>
            </select>
          </label>
          <label className="text-xs md:col-span-2">
            <span className="text-zinc-500">input</span>
            <input
              value={a2aInput}
              onChange={(e) => setA2aInput(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="text-xs">
            <span className="text-zinc-500">timeout (s)</span>
            <input
              type="number"
              value={a2aTimeout}
              onChange={(e) => setA2aTimeout(Number(e.target.value))}
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
            />
          </label>
          <div className="md:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={a2aRunning || !a2aPeer}
              className="rounded bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30 disabled:opacity-40"
            >
              {a2aRunning ? "Sending…" : "Send A2A"}
            </button>
          </div>
        </form>
        {a2aResult && (
          <pre className="mt-3 max-h-72 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-300">
            {JSON.stringify(a2aResult, null, 2)}
          </pre>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-3 text-sm font-medium text-zinc-400">Phase 1 · Raw send-job (legacy)</h2>
        <form onSubmit={sendPhase1} className="grid gap-3 md:grid-cols-3">
          <label className="text-xs">
            <span className="text-zinc-500">task</span>
            <select
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
            >
              <option value="uppercase_text">uppercase_text</option>
              <option value="summarise_documents">summarise_documents</option>
            </select>
          </label>
          <label className="text-xs md:col-span-2">
            <span className="text-zinc-500">input</span>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <label className="text-xs">
            <span className="text-zinc-500">timeout (s)</span>
            <input
              type="number"
              value={phase1Timeout}
              onChange={(e) => setPhase1Timeout(Number(e.target.value))}
              className="mt-1 w-24 rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex items-end md:col-span-2 justify-end">
            <button
              type="submit"
              disabled={phase1Running}
              className="rounded bg-zinc-700/40 px-3 py-1.5 text-sm text-zinc-200 ring-1 ring-zinc-600 hover:bg-zinc-700/60 disabled:opacity-40"
            >
              {phase1Running ? "Sending…" : "Send raw /send + /recv"}
            </button>
          </div>
        </form>
        <p className="mt-2 text-[11px] text-zinc-500">
          The Phase 1 path expects the original <code>agent_b_mock.py</code> polling /recv on n2&apos;s
          bridge — it&apos;s preserved for backwards compat but the Phase 4 A2A flow above is the one that
          actually goes through AXL&apos;s structured envelope.
        </p>
        {phase1Result && (
          <pre className="mt-3 max-h-60 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-300">
            {JSON.stringify(phase1Result, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
