"use client";

import { useEffect, useState } from "react";
import {
  api,
  type CompleteHireResult,
  type FeedbackResult,
  type SettlementResult,
  type SettlementStatus,
  type SetupStatus,
  type AxlTopology,
} from "@/lib/api";
import { txUrl } from "@/lib/links";

function ModeBadge({ mode, live }: { mode: string; live: boolean }) {
  return (
    <span
      className={
        "rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " +
        (live
          ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30"
          : "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30")
      }
    >
      {mode}
    </span>
  );
}

function StatusPanel({ status }: { status: SettlementStatus }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">KeeperHub</span>
          <ModeBadge mode={status.keeperhub.mode} live={status.keeperhub.mode !== "stub"} />
        </div>
        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between">
            <dt className="text-zinc-500">api key</dt>
            <dd className="text-zinc-200">{status.keeperhub.api_key_configured ? "configured" : "not set"}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">network</dt>
            <dd className="text-zinc-200">{status.keeperhub.network}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">token</dt>
            <dd className="text-zinc-200">{status.keeperhub.token}</dd>
          </div>
        </dl>
        {status.keeperhub.mode === "stub" && (
          <p className="mt-2 text-[11px] text-zinc-500">
            Set <code className="rounded bg-zinc-800 px-1">KEEPERHUB_API_KEY</code> in <code>.env</code>
            to switch to a real workflow.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-zinc-400">Feedback signer</span>
          <ModeBadge
            mode={status.feedback_signer.mode === "live" ? "live" : "dry-run"}
            live={status.feedback_signer.mode === "live"}
          />
        </div>
        <dl className="mt-2 space-y-1 text-xs">
          <div className="flex justify-between">
            <dt className="text-zinc-500">private key</dt>
            <dd className="text-zinc-200">
              {status.feedback_signer.private_key_configured ? "configured" : "not set"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-500">chain id</dt>
            <dd className="text-zinc-200">{status.feedback_signer.chain_id}</dd>
          </div>
          {status.feedback_signer.address && (
            <div className="flex justify-between">
              <dt className="text-zinc-500">address</dt>
              <dd className="break-all font-mono text-emerald-300">
                {status.feedback_signer.address.slice(0, 10)}…{status.feedback_signer.address.slice(-6)}
              </dd>
            </div>
          )}
          {status.feedback_signer.balance_eth !== undefined && (
            <div className="flex justify-between">
              <dt className="text-zinc-500">balance</dt>
              <dd className={status.feedback_signer.balance_eth < 0.0005 ? "text-amber-300" : "text-zinc-200"}>
                {status.feedback_signer.balance_eth.toFixed(6)} ETH
              </dd>
            </div>
          )}
        </dl>
        {status.feedback_signer.mode === "dry_run" && (
          <p className="mt-2 text-[11px] text-zinc-500">
            Set <code className="rounded bg-zinc-800 px-1">PRIVATE_KEY</code> in <code>.env</code>
            (Sepolia ETH from{" "}
            <a className="text-emerald-300 underline" href="https://www.alchemy.com/faucets/base-sepolia" target="_blank">
              Alchemy faucet
            </a>
            ) to broadcast real <code>giveFeedback</code> txs.
          </p>
        )}
      </div>
    </div>
  );
}

function SettlePanel({ status }: { status: SettlementStatus | null }) {
  const [wallet, setWallet] = useState("0x21fdEd74C901129977B8e28C2588595163E1e235");
  const [amount, setAmount] = useState(0.5);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SettlementResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setRunning(true);
    setErr(null);
    setResult(null);
    try {
      const r = await api.settle({ agent_wallet: wallet, amount_usdc: amount });
      setResult(r);
    } catch (e) {
      setErr(`${(e as Error).message || e}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <h3 className="mb-2 text-sm font-medium text-zinc-400">settle_payment</h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Calls KeeperHub to create + trigger a payment workflow. With{" "}
        <code className="rounded bg-zinc-800 px-1">KEEPERHUB_API_KEY</code> set this hits the real
        MCP/REST endpoint; otherwise it produces a deterministic stub receipt so the flow stays
        runnable.{" "}
        <ModeBadge
          mode={status?.keeperhub.mode || "?"}
          live={(status?.keeperhub.mode ?? "stub") !== "stub"}
        />
      </p>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-3">
        <label className="text-xs md:col-span-2">
          <span className="text-zinc-500">agent_wallet</span>
          <input
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm font-mono"
          />
        </label>
        <label className="text-xs">
          <span className="text-zinc-500">amount (USDC)</span>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
          />
        </label>
        <div className="md:col-span-3 flex justify-end">
          <button
            type="submit"
            disabled={running || !wallet}
            className="rounded bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30 disabled:opacity-40"
          >
            {running ? "Settling…" : "Settle"}
          </button>
        </div>
      </form>
      {err && <div className="mt-3 rounded border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">{err}</div>}
      {result && (
        <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 p-3 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">
              <ModeBadge mode={result.mode} live={result.mode !== "stub"} /> · {result.status}
            </span>
            <span className="font-mono text-zinc-500">{result.workflow_id}</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-1 text-zinc-300">
            <dt className="text-zinc-500">amount</dt>
            <dd>{result.amount} {result.token}</dd>
            <dt className="text-zinc-500">network</dt>
            <dd>{result.network}</dd>
            {result.tx_hash && (
              <>
                <dt className="text-zinc-500">tx</dt>
                <dd className="break-all font-mono">
                  {result.tx_hash.startsWith("0xstub") ? (
                    <span className="text-zinc-500">{result.tx_hash}</span>
                  ) : (
                    <a
                      href={txUrl(null, result.tx_hash)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-300 hover:underline"
                    >
                      {result.tx_hash}
                    </a>
                  )}
                </dd>
              </>
            )}
          </dl>
          {result.audit_log && result.audit_log.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-zinc-400">
              {result.audit_log.map((a, i) => (
                <li key={i}>
                  <span className={a.ok ? "text-emerald-400" : "text-rose-400"}>{a.ok ? "✓" : "✗"}</span>{" "}
                  {a.step}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function FeedbackPanel({ status }: { status: SettlementStatus | null }) {
  const [agentId, setAgentId] = useState(17);
  const [score, setScore] = useState(0.95);
  const [tag1, setTag1] = useState("trustgate");
  const [tag2, setTag2] = useState("phase5-demo");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setRunning(true);
    setErr(null);
    setResult(null);
    try {
      const r = await api.writeFeedback({
        agent_id: agentId,
        score,
        tags: [tag1, tag2].filter(Boolean),
        feedback_payload: {
          source: "trustgate-dashboard",
          phase: 5,
          ts: new Date().toISOString(),
        },
      });
      setResult(r);
    } catch (e) {
      setErr(`${(e as Error).message || e}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <h3 className="mb-2 text-sm font-medium text-zinc-400">write_feedback (giveFeedback onchain)</h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Writes a feedback row to the ERC-8004 Reputation Registry. With{" "}
        <code className="rounded bg-zinc-800 px-1">PRIVATE_KEY</code> set, this signs and broadcasts a
        real Base Sepolia transaction; otherwise the panel returns the encoded calldata so you can
        inspect and broadcast it yourself.{" "}
        <ModeBadge
          mode={status?.feedback_signer.mode === "live" ? "live" : "dry-run"}
          live={status?.feedback_signer.mode === "live"}
        />
      </p>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
        <label className="text-xs">
          <span className="text-zinc-500">agent_id</span>
          <input
            type="number"
            value={agentId}
            onChange={(e) => setAgentId(Number(e.target.value))}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-zinc-500">score (0..1)</span>
          <input
            type="number"
            step="0.01"
            min={0}
            max={1}
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-zinc-500">tag1</span>
          <input
            value={tag1}
            onChange={(e) => setTag1(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-zinc-500">tag2</span>
          <input
            value={tag2}
            onChange={(e) => setTag2(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
          />
        </label>
        <div className="md:col-span-4 flex justify-end">
          <button
            type="submit"
            disabled={running}
            className="rounded bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30 disabled:opacity-40"
          >
            {running ? "Writing…" : "Write feedback"}
          </button>
        </div>
      </form>
      {err && <div className="mt-3 rounded border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">{err}</div>}
      {result && (
        <div className="mt-3 rounded border border-zinc-800 bg-zinc-950 p-3 text-xs">
          <div className="flex items-center justify-between">
            <ModeBadge mode={result.mode} live={result.mode === "live"} />
            <span className="text-zinc-500">
              raw {result.score_raw} → score {result.score.toFixed(3)}
            </span>
          </div>
          {result.mode === "live" && result.tx_hash && (
            <div className="mt-2">
              <a
                href={txUrl(null, result.tx_hash)}
                className="break-all font-mono text-emerald-300 underline"
                target="_blank"
                rel="noreferrer"
              >
                {result.tx_hash}
              </a>
              <div className="mt-1 text-zinc-400">
                block {result.block_number} · gas {result.gas_used} · status {result.status}
              </div>
            </div>
          )}
          {result.mode === "dry_run" && (
            <div className="mt-2">
              <div className="text-zinc-400">calldata (paste into your wallet to sign manually):</div>
              <pre className="mt-1 max-h-40 overflow-auto rounded bg-black/50 p-2 break-all font-mono text-[10px] text-zinc-300">
                {result.calldata}
              </pre>
            </div>
          )}
          {result.error && <div className="mt-2 text-rose-300">{result.error}</div>}
        </div>
      )}
    </section>
  );
}

function CompleteHirePanel() {
  const [topoB, setTopoB] = useState<AxlTopology | null>(null);
  const [topoC, setTopoC] = useState<AxlTopology | null>(null);
  const [service, setService] = useState("uppercase_text");
  const [input, setInput] = useState("complete hire demo");
  const [amount, setAmount] = useState(0.25);
  const [feedbackScore, setFeedbackScore] = useState(0.95);
  const [targetAgentId, setTargetAgentId] = useState(-1);
  const [payeeWallet, setPayeeWallet] = useState("0x21fdEd74C901129977B8e28C2588595163E1e235");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CompleteHireResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.axlTopology(9012), api.axlTopology(9022)])
      .then(([b, c]) => {
        setTopoB(b);
        setTopoC(c);
      })
      .catch(() => {});
  }, []);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!topoB?.topology || !topoC?.topology) {
      setErr("Need both worker-b and worker-c online (start them in the AXL Bridge tab first).");
      return;
    }
    setRunning(true);
    setErr(null);
    setResult(null);
    const bPk = topoB.topology.our_public_key;
    const cPk = topoC.topology.our_public_key;
    try {
      const r = await api.completeHire({
        capability: "phase5-demo",
        service,
        input,
        candidates: [],
        extra_candidates: [
          {
            agent_id: targetAgentId,
            name: "worker-b",
            axl_pubkey: bPk,
            endpoints: [{ name: "axl", endpoint: bPk }],
            ...(payeeWallet ? { wallet: payeeWallet } : {}),
          } as never,
          {
            agent_id: targetAgentId,
            name: "worker-c",
            axl_pubkey: cPk,
            endpoints: [{ name: "axl", endpoint: cPk }],
            ...(payeeWallet ? { wallet: payeeWallet } : {}),
          } as never,
        ],
        a2a_timeout: 5,
        payment_amount_usdc: amount,
        feedback_score: feedbackScore,
        feedback_tags: ["trustgate", "phase5-demo"],
        write_feedback_onchain: targetAgentId >= 0,
        force_stub_settlement: true,
      });
      setResult(r);
    } catch (e) {
      setErr(`${(e as Error).message || e}`);
    } finally {
      setRunning(false);
    }
  }

  function StatusBadge({ s }: { s: string }) {
    const colour =
      s === "ok"
        ? "bg-emerald-500/20 text-emerald-200 ring-emerald-400/30"
        : s.endsWith("_failed")
        ? "bg-rose-500/20 text-rose-200 ring-rose-400/30"
        : "bg-zinc-700/60 text-zinc-200 ring-zinc-500/30";
    return <span className={`rounded px-2 py-0.5 text-[10px] uppercase ring-1 ${colour}`}>{s}</span>;
  }

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
      <h3 className="mb-2 text-sm font-medium text-zinc-400">
        Complete hire loop · find_best_agent → A2A → settle → write_feedback
      </h3>
      <p className="mb-3 text-[11px] text-zinc-500">
        Drives the whole pipeline end-to-end against the local Phase-4 workers. Settlement runs in
        stub mode (toggle in <code>.env</code>); feedback is written onchain only if you supply a real
        agent id (otherwise skipped — synthetic candidates have no on-chain counterpart).
      </p>
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
        <label className="text-xs">
          <span className="text-zinc-500">service</span>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
          >
            <option value="uppercase_text">uppercase_text</option>
            <option value="summarise_documents">summarise_documents</option>
            <option value="sleep_then_succeed">sleep_then_succeed</option>
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
          <span className="text-zinc-500">amount (USDC)</span>
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-zinc-500">feedback score</span>
          <input
            type="number"
            step="0.01"
            min={0}
            max={1}
            value={feedbackScore}
            onChange={(e) => setFeedbackScore(Number(e.target.value))}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs">
          <span className="text-zinc-500">target agent_id (-1 = skip feedback)</span>
          <input
            type="number"
            value={targetAgentId}
            onChange={(e) => setTargetAgentId(Number(e.target.value))}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm"
          />
        </label>
        <label className="text-xs md:col-span-2">
          <span className="text-zinc-500">payee wallet</span>
          <input
            value={payeeWallet}
            onChange={(e) => setPayeeWallet(e.target.value)}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-sm font-mono"
          />
        </label>
        <div className="md:col-span-4 flex justify-end">
          <button
            type="submit"
            disabled={running}
            className="rounded bg-emerald-500/20 px-3 py-1.5 text-sm text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30 disabled:opacity-40"
          >
            {running ? "Running…" : "Run full hire loop"}
          </button>
        </div>
      </form>
      {err && <div className="mt-3 rounded border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">{err}</div>}
      {result && (
        <div className="mt-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400">overall</span>
            <StatusBadge s={result.overall_status} />
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
            <div className="mb-1 text-zinc-400">1 · delivery (A2A)</div>
            <div className="text-zinc-300">
              winner index: {result.hire.winner_index ?? "—"} · attempts: {result.hire.attempts.length}
            </div>
            {result.hire.final_reply && (
              <pre className="mt-1 overflow-auto text-[11px] text-emerald-200">
                {JSON.stringify(result.hire.final_reply, null, 2)}
              </pre>
            )}
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
            <div className="mb-1 text-zinc-400">2 · settlement (KeeperHub)</div>
            {result.settlement ? (
              <>
                <div className="flex items-center justify-between text-zinc-300">
                  <span>
                    {result.settlement.amount} {result.settlement.token} → {result.settlement.agent_wallet.slice(0, 10)}…
                  </span>
                  <ModeBadge mode={result.settlement.mode} live={result.settlement.mode !== "stub"} />
                </div>
                <div className="mt-1 text-zinc-500">
                  {result.settlement.status} · {result.settlement.workflow_id}
                </div>
              </>
            ) : (
              <div className="text-zinc-500">— skipped —</div>
            )}
          </div>
          <div className="rounded border border-zinc-800 bg-zinc-950 p-3">
            <div className="mb-1 text-zinc-400">3 · feedback (ReputationRegistry)</div>
            {result.feedback ? (
              <pre className="overflow-auto text-[11px] text-zinc-300">
                {JSON.stringify(result.feedback, null, 2)}
              </pre>
            ) : (
              <div className="text-zinc-500">— skipped —</div>
            )}
          </div>
          {result.error && <div className="text-rose-300">{result.error}</div>}
        </div>
      )}
    </section>
  );
}

function KeeperHubReadinessPanel() {
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setRefreshing(true);
    setErr(null);
    try {
      const s = await api.setupStatus();
      setSetup(s);
    } catch (e) {
      setErr((e as Error).message || String(e));
    } finally {
      setRefreshing(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (!setup) {
    return (
      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-xs text-zinc-500">
        {err || "Probing KeeperHub readiness…"}
      </section>
    );
  }

  // Don't add visual noise once everything is green; the StatusPanel already
  // shows the live badge. Surface this checklist only when there's something
  // for the user to act on.
  const everythingOk = setup.ready.keeperhub_live;
  if (everythingOk) {
    return (
      <section className="rounded border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-200">
        ✓ KeeperHub live mode ready — API key configured and{" "}
        <code className="rounded bg-zinc-800/60 px-1">{setup.keeperhub.mcp_url}</code> reachable.
        Settlements below will broadcast for real.
      </section>
    );
  }

  // Stub mode (no API key) is a fully valid demo path; show a calmer
  // single-line callout rather than the full checklist.
  if (!setup.keeperhub.api_key_configured) {
    return (
      <section className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
        Stub mode — settlement returns a deterministic{" "}
        <code className="rounded bg-zinc-800/60 px-1">wf_&lt;sha256&gt;</code> workflow id with full
        audit log so the loop is demonstrable. Set{" "}
        <code className="rounded bg-zinc-800/60 px-1">KEEPERHUB_API_KEY</code> to upgrade to live.
      </section>
    );
  }

  // The interesting case: API key set but MCP unreachable.
  return (
    <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-amber-200">KeeperHub: 1 step left to go live</h3>
          <p className="mt-1 text-[11px] text-zinc-400">
            API key is set, but neither{" "}
            <code className="rounded bg-zinc-800/60 px-1">{setup.keeperhub.mcp_url}</code> nor the
            public REST host is reachable. Settlements will return{" "}
            <code className="rounded bg-zinc-800/60 px-1">live-unreachable</code> until this is fixed.
          </p>
        </div>
        <button
          onClick={load}
          disabled={refreshing}
          className="shrink-0 rounded bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
        >
          {refreshing ? "Probing…" : "Probe again"}
        </button>
      </div>
      <ol className="mt-3 space-y-2 text-sm">
        <li className="flex gap-2">
          <span className="mr-1 inline-block w-3 text-center font-mono text-emerald-400">✓</span>
          <div className="flex-1">
            <div className="text-zinc-200">API key configured</div>
            <div className="text-[11px] text-zinc-500">read from .env / loaded into the API process</div>
          </div>
        </li>
        <li className="flex gap-2">
          <span className="mr-1 inline-block w-3 text-center font-mono text-amber-400">!</span>
          <div className="flex-1">
            <div className="text-zinc-200">Fund a KeeperHub-managed wallet (manual)</div>
            <div className="text-[11px] text-zinc-500">
              top up the workflow source wallet with{" "}
              <code className="rounded bg-zinc-800/60 px-1">{setup.keeperhub.token}</code> on{" "}
              <code className="rounded bg-zinc-800/60 px-1">{setup.keeperhub.network}</code> at{" "}
              <a
                href="https://app.keeperhub.com"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline"
              >
                app.keeperhub.com
              </a>{" "}
              — there's no way to probe this from outside.
            </div>
          </div>
        </li>
        <li className="flex gap-2">
          <span className="mr-1 inline-block w-3 text-center font-mono text-rose-400">✗</span>
          <div className="flex-1">
            <div className="text-zinc-200">Run / point at a KeeperHub MCP server</div>
            <div className="text-[11px] text-zinc-500">
              install per{" "}
              <a
                href="https://docs.keeperhub.com/ai-tools"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline"
              >
                docs.keeperhub.com/ai-tools
              </a>
              , or set{" "}
              <code className="rounded bg-zinc-800/60 px-1">KEEPERHUB_MCP_URL</code> in{" "}
              <code className="rounded bg-zinc-800/60 px-1">.env</code> to a reachable host.
              {setup.keeperhub.mcp_error && (
                <span className="block mt-1 text-rose-300">{setup.keeperhub.mcp_error}</span>
              )}
            </div>
          </div>
        </li>
      </ol>
    </section>
  );
}

export function SettleTab() {
  const [status, setStatus] = useState<SettlementStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.settlementStatus().then(setStatus).catch((e) => setErr(`${e.message || e}`));
  }, []);

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">Phase 5 · settle &amp; record</h2>
        {err ? (
          <div className="rounded border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">{err}</div>
        ) : status ? (
          <StatusPanel status={status} />
        ) : (
          <div className="text-sm text-zinc-500">Loading…</div>
        )}
      </section>

      <KeeperHubReadinessPanel />

      <CompleteHirePanel />
      <SettlePanel status={status} />
      <FeedbackPanel status={status} />
    </div>
  );
}
