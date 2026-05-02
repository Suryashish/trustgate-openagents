"use client";

import { useEffect, useState } from "react";
import { api, type CacheStatus, type CompleteHireResult, type NetworkInfo } from "@/lib/api";
import { addressUrl } from "@/lib/links";
import { SetupWizard } from "./SetupWizard";
import { Tooltip } from "./Tooltip";

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

const STAGES = [
  { key: "discover", label: "Discover" },
  { key: "rank", label: "Rank" },
  { key: "deliver", label: "Deliver" },
  { key: "settle", label: "Settle" },
  { key: "feedback", label: "Feedback" },
] as const;

type StageKey = (typeof STAGES)[number]["key"];
type StageState = "idle" | "active" | "ok" | "fail" | "skipped";

function deriveStages(r: CompleteHireResult | null): Record<StageKey, StageState> {
  if (!r) {
    return { discover: "idle", rank: "idle", deliver: "idle", settle: "idle", feedback: "idle" };
  }
  const hasCandidates = (r.hire?.candidates?.length ?? 0) > 0;
  const delivered = r.hire?.winner_index !== null && r.hire?.winner_index !== undefined;
  const settle: StageState =
    !r.settlement
      ? "skipped"
      : r.settlement.status === "executed"
        ? "ok"
        : r.settlement.status === "pending"
          ? "active"
          : "fail";
  const fb = r.feedback;
  const feedback: StageState =
    !fb
      ? "skipped"
      : fb.mode === "skipped"
        ? "skipped"
        : fb.mode === "error"
          ? "fail"
          : "ok";
  return {
    discover: hasCandidates ? "ok" : "fail",
    rank: hasCandidates ? "ok" : "fail",
    deliver: delivered ? "ok" : "fail",
    settle,
    feedback,
  };
}

function StagePill({ state, label }: { state: StageState; label: string }) {
  const styles: Record<StageState, string> = {
    idle: "border-zinc-800 bg-zinc-900/40 text-zinc-500",
    active: "border-amber-400/30 bg-amber-500/10 text-amber-300 animate-pulse",
    ok: "border-emerald-400/30 bg-emerald-500/15 text-emerald-300",
    fail: "border-rose-400/30 bg-rose-500/15 text-rose-300",
    skipped: "border-zinc-700 bg-zinc-800/40 text-zinc-500",
  };
  const glyph = { idle: "·", active: "…", ok: "✓", fail: "✗", skipped: "—" }[state];
  return (
    <div className={`flex items-center gap-2 rounded border px-2 py-1 text-xs ${styles[state]}`}>
      <span className="font-mono">{glyph}</span>
      <span>{label}</span>
    </div>
  );
}

function SampleHirePanel() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CompleteHireResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [stages, setStages] = useState<Record<StageKey, StageState>>(() => deriveStages(null));
  const [workersOnline, setWorkersOnline] = useState<{ b: boolean; c: boolean }>({ b: false, c: false });

  // Probe whether the two phase4 workers are up — if not, the sample hire
  // can't deliver.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.axlTopology(9012).then((t) => !!t.topology).catch(() => false),
      api.axlTopology(9022).then((t) => !!t.topology).catch(() => false),
    ]).then(([b, c]) => {
      if (cancelled) return;
      setWorkersOnline({ b, c });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function run() {
    setRunning(true);
    setErr(null);
    setResult(null);
    setStages({ discover: "active", rank: "idle", deliver: "idle", settle: "idle", feedback: "idle" });

    try {
      const [topoB, topoC] = await Promise.all([api.axlTopology(9012), api.axlTopology(9022)]);
      if (!topoB.topology || !topoC.topology) {
        throw new Error(
          "worker-b / worker-c not reachable. Run `bash scripts/run.sh` to bring up the full stack."
        );
      }
      setStages((s) => ({ ...s, discover: "ok", rank: "active" }));

      const bPk = topoB.topology.our_public_key;
      const cPk = topoC.topology.our_public_key;
      setStages((s) => ({ ...s, rank: "ok", deliver: "active" }));

      const r = await api.completeHire({
        capability: "phase8-overview-demo",
        service: "uppercase_text",
        input: "trustgate sample hire — overview tab",
        candidates: [],
        extra_candidates: [
          {
            agent_id: -1,
            name: "worker-b",
            axl_pubkey: bPk,
            endpoints: [{ name: "axl", endpoint: bPk }],
          },
          {
            agent_id: -1,
            name: "worker-c",
            axl_pubkey: cPk,
            endpoints: [{ name: "axl", endpoint: cPk }],
          },
        ] as never,
        a2a_timeout: 5,
        payment_amount_usdc: 0.1,
        feedback_score: 0.95,
        feedback_tags: ["trustgate", "phase8-demo"],
        write_feedback_onchain: false,
        force_stub_settlement: true,
      });
      setResult(r);
      setStages(deriveStages(r));
    } catch (e) {
      setErr((e as Error).message || String(e));
      setStages((s) => {
        const next = { ...s };
        for (const k of Object.keys(next) as StageKey[]) {
          if (next[k] === "active" || next[k] === "idle") next[k] = "fail";
        }
        return next;
      });
    } finally {
      setRunning(false);
    }
  }

  const replyText = (() => {
    const r = result?.hire?.final_reply;
    if (!r) return null;
    const inner = (r as { result?: unknown; reply?: unknown }).result ?? (r as { reply?: unknown }).reply;
    return typeof inner === "string" ? inner : JSON.stringify(inner ?? r, null, 2);
  })();

  return (
    <section className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-emerald-200">Run a sample hire</h3>
          <p className="mt-1 text-xs text-zinc-400">
            One click drives the whole loop against the local workers — no wallet, no gas, no setup
            beyond <code className="rounded bg-zinc-800 px-1">bash scripts/run.sh</code>.
          </p>
        </div>
        <button
          onClick={run}
          disabled={running || !workersOnline.b || !workersOnline.c}
          title={
            !workersOnline.b || !workersOnline.c
              ? "Need worker-b (port 9012) and worker-c (port 9022) online"
              : "Run discover → deliver → settle → feedback against the local workers"
          }
          className="rounded bg-emerald-500/30 px-4 py-2 text-sm font-medium text-emerald-50 ring-1 ring-emerald-400/40 hover:bg-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? "Running…" : "Run a sample hire"}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {STAGES.map((s) => (
          <StagePill key={s.key} state={stages[s.key]} label={s.label} />
        ))}
      </div>

      {!workersOnline.b || !workersOnline.c ? (
        <p className="mt-3 text-[11px] text-amber-300">
          Workers offline — run <code className="rounded bg-zinc-800 px-1">bash scripts/run.sh</code>{" "}
          to bring up the full stack.
        </p>
      ) : null}

      {err && (
        <pre className="mt-3 whitespace-pre-wrap rounded border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">
          {err}
        </pre>
      )}

      {result && replyText !== null && (
        <div className="mt-4 space-y-2 text-xs">
          <div className="text-zinc-400">
            Winner: <span className="text-zinc-100">worker-{result.hire?.winner_index === 0 ? "b" : "c"}</span>{" "}
            · settled in <span className="tabular-nums text-zinc-100">{result.settlement?.elapsed_seconds?.toFixed(2) ?? "—"}s</span>{" "}
            · workflow{" "}
            <code className="rounded bg-zinc-800 px-1 font-mono text-emerald-300">
              {result.settlement?.workflow_id || "(none)"}
            </code>
          </div>
          <div>
            <div className="text-zinc-500">Worker reply</div>
            <pre className="mt-1 overflow-auto rounded bg-zinc-950/60 p-2 text-zinc-200 ring-1 ring-zinc-800">
              {replyText}
            </pre>
          </div>
        </div>
      )}
    </section>
  );
}

function CodeAddrLink({ addr, href }: { addr: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="break-all font-mono text-[11px] text-emerald-300 hover:underline"
    >
      {addr}
    </a>
  );
}

export function OverviewTab({
  network,
  cache,
}: {
  network: NetworkInfo | null;
  cache: CacheStatus | null;
}) {
  const pct =
    cache?.deploy_block != null && cache.last_scanned_block != null
      ? Math.min(
          100,
          (100 *
            (cache.last_scanned_block - cache.deploy_block)) /
            Math.max(1, cache.head_block - cache.deploy_block)
        )
      : null;

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-sm font-medium text-zinc-400">Pipeline at a glance</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Stat
            label="Network"
            value={network?.network ?? "—"}
            hint={network ? `chain ${network.chain_id}` : undefined}
          />
          <Stat
            label="Head block"
            value={network ? network.head_block.toLocaleString() : "—"}
            hint={network?.rpc_url}
          />
          <Stat
            label="Agents in cache"
            value={cache ? cache.agents_in_cache.toLocaleString() : "—"}
            hint={cache && cache.cards_in_cache != null ? `${cache.cards_in_cache.toLocaleString()} cards hydrated` : undefined}
          />
          <Stat
            label="Scan progress"
            value={pct != null ? `${pct.toFixed(1)}%` : "—"}
            hint={
              cache?.blocks_behind != null
                ? `${cache.blocks_behind.toLocaleString()} blocks behind head`
                : undefined
            }
          />
        </div>
      </section>

      <SetupWizard />

      <SampleHirePanel />

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <h3 className="mb-3 text-sm font-medium text-zinc-400">The five-stage hiring loop</h3>
          <ol className="space-y-2 text-sm text-zinc-300">
            <li>
              <span className="mr-2 text-emerald-400">1.</span>
              <span className="font-medium">Broadcast</span>
              <span className="text-zinc-500">
                {" "}· Agent A sends a job spec over{" "}
                <Tooltip text="Gensyn AXL — encrypted P2P mesh between agent nodes. No coordinator server.">
                  AXL
                </Tooltip>
              </span>
            </li>
            <li>
              <span className="mr-2 text-emerald-400">2.</span>
              <span className="font-medium">Discover</span>
              <span className="text-zinc-500">
                {" "}·{" "}
                <Tooltip text="ERC-8004 Identity Registry. Each agent is an ERC-721 NFT whose tokenURI points at a JSON card listing capabilities + endpoints.">
                  Identity Registry
                </Tooltip>
                {" "}→ candidates by capability
              </span>
            </li>
            <li>
              <span className="mr-2 text-emerald-400">3.</span>
              <span className="font-medium">Evaluate</span>
              <span className="text-zinc-500">
                {" "}·{" "}
                <Tooltip text="ERC-8004 Reputation Registry stores int128 scores in [-100, 100]. We normalize to [0,1] and average non-revoked entries client-side.">
                  Reputation Registry
                </Tooltip>
                {" "}→ ranked list (
                <Tooltip text="0.60 × reputation + 0.20 × price + 0.20 × latency">60/20/20</Tooltip>
                )
              </span>
            </li>
            <li>
              <span className="mr-2 text-emerald-400">4.</span>
              <span className="font-medium">Hire &amp; deliver</span>
              <span className="text-zinc-500">
                {" "}· AXL{" "}
                <Tooltip text="Agent-to-Agent JSON-RPC envelope. Forwarded over the AXL mesh; the receiver implements /.well-known/agent-card.json + a SendMessage POST handler.">
                  A2A SendMessage
                </Tooltip>
                {" "}+ retry/fallback to runner-up
              </span>
            </li>
            <li>
              <span className="mr-2 text-emerald-400">5.</span>
              <span className="font-medium">Settle &amp; record</span>
              <span className="text-zinc-500">
                {" "}·{" "}
                <Tooltip text="KeeperHub orchestrates onchain payment workflows with retry + idempotency. Stub mode produces a deterministic audit trail for demos without a paid account.">
                  KeeperHub
                </Tooltip>
                {" "}workflow +{" "}
                <Tooltip text="ReputationRegistry.giveFeedback(agentId, score, valueDecimals, tag1, tag2, endpoint, feedbackURI, feedbackHash). Permissionless but each (client, agent) pair has its own append-only log.">
                  giveFeedback
                </Tooltip>
                {" "}onchain
              </span>
            </li>
          </ol>
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <h3 className="mb-3 text-sm font-medium text-zinc-400">Live contracts</h3>
          {network ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-zinc-500">Identity Registry</dt>
                <dd>
                  <CodeAddrLink
                    addr={network.identity_registry}
                    href={addressUrl(network, network.identity_registry)}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Reputation Registry</dt>
                <dd>
                  <CodeAddrLink
                    addr={network.reputation_registry}
                    href={addressUrl(network, network.reputation_registry)}
                  />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">RPC</dt>
                <dd>
                  <code className="break-all font-mono text-[11px] text-zinc-400">{network.rpc_url}</code>
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-zinc-500">Loading…</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 text-sm text-zinc-400">
        <h3 className="mb-2 text-sm font-medium text-zinc-400">How to use this dashboard</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <span className="text-zinc-200">Agents</span> · browse the cached registry, filter by
            capability, and inspect any agent&apos;s onchain card + reputation feedback.
          </li>
          <li>
            <span className="text-zinc-200">Hire</span> · run <code className="rounded bg-zinc-800 px-1 py-0.5 text-xs">find_best_agent(capability, budget)</code>{" "}
            and see the 60/20/20 score breakdown for each candidate.
          </li>
          <li>
            <span className="text-zinc-200">AXL Bridge</span> · view the local AXL nodes&apos; topology and
            replay the Phase 1 send-job loop end-to-end.
          </li>
          <li>
            <span className="text-zinc-200">Settle</span> · Phase 5 — drive the full
            hire → A2A → settle → write_feedback pipeline. Also exposes settle_payment
            and giveFeedback as separate panels with stub / dry-run modes.
          </li>
          <li>
            <span className="text-zinc-200">Self</span> · Phase 6/7 — TrustGate is itself
            registered as an ERC-8004 agent. The Self tab shows the signer, the published
            card, and lets you re-broadcast registration / look up ENS names.
          </li>
        </ul>
      </section>
    </div>
  );
}
