"use client";

import { useEffect, useState } from "react";
import { api, type AxlSendJobResult, type AxlTopology } from "@/lib/api";

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
            <dt className="text-zinc-500">ipv6</dt>
            <dd className="break-all font-mono text-zinc-400">{t.our_ipv6}</dd>
          </div>
          <div>
            <dt className="text-zinc-500">peers</dt>
            <dd className="text-zinc-300">
              {t.peers.length === 0
                ? "none"
                : t.peers.map((p, i) => (
                    <div key={i} className="font-mono">
                      {p.uri}{" "}
                      <span className={p.up ? "text-emerald-400" : "text-rose-400"}>
                        {p.up ? "up" : "down"}
                      </span>
                      {p.inbound ? " ← in" : " → out"}
                    </div>
                  ))}
            </dd>
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
  const [topoA, setTopoA] = useState<AxlTopology | null>(null);
  const [topoB, setTopoB] = useState<AxlTopology | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [task, setTask] = useState("uppercase_text");
  const [input, setInput] = useState("trustgate axl ok");
  const [timeout, setTimeoutS] = useState(30);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<AxlSendJobResult | null>(null);

  async function refreshTopology() {
    setLoading(true);
    setErr(null);
    try {
      const [a, b] = await Promise.all([api.axlTopology(aPort), api.axlTopology(bPort)]);
      setTopoA(a);
      setTopoB(b);
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

  async function sendJob(e?: React.FormEvent) {
    e?.preventDefault();
    setRunning(true);
    setResult(null);
    setErr(null);
    try {
      const r = await api.axlSendJob({ a_port: aPort, b_port: bPort, task, input, timeout });
      setResult(r);
    } catch (e) {
      setErr(`${(e as Error).message || e}`);
    } finally {
      setRunning(false);
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
            <span className="text-zinc-600">/</span>
            <input
              type="number"
              value={bPort}
              onChange={(e) => setBPort(Number(e.target.value))}
              className="w-20 rounded border border-zinc-800 bg-zinc-950 px-2 py-1"
            />
            <button
              onClick={refreshTopology}
              className="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700"
            >
              Refresh
            </button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <NodeCard label="Agent A / TrustGate" port={aPort} topo={topoA} loading={loading} />
          <NodeCard label="Agent B" port={bPort} topo={topoB} loading={loading} />
        </div>
        {err && (
          <div className="mt-3 rounded border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">
            {err}
            <div className="mt-1 text-rose-300/70">
              If the bridges are unreachable, start them with{" "}
              <code className="rounded bg-zinc-900 px-1">bash scripts/start_axl_nodes.sh</code> in WSL,
              and run <code className="rounded bg-zinc-900 px-1">app/agent_b_mock.py --port {bPort}</code>.
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="mb-3 text-sm font-medium text-zinc-400">Replay the Phase 1 send-job loop</h2>
        <form onSubmit={sendJob} className="grid gap-3 md:grid-cols-3">
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
              value={timeout}
              onChange={(e) => setTimeoutS(Number(e.target.value))}
              className="mt-1 w-24 rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
            />
          </label>
          <div className="flex items-end md:col-span-2">
            <button
              type="submit"
              disabled={running}
              className="ml-auto rounded bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30 disabled:opacity-40"
            >
              {running ? "Sending…" : "Send job over AXL"}
            </button>
          </div>
        </form>

        {result && (
          <pre className="mt-4 max-h-72 overflow-auto rounded border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-300">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </section>
    </div>
  );
}
