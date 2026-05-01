"use client";

import type { CacheStatus, NetworkInfo } from "@/lib/api";

function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="text-xs uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

function CodeAddr({ children }: { children: React.ReactNode }) {
  return (
    <code className="break-all font-mono text-[11px] text-emerald-300">{children}</code>
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

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <h3 className="mb-3 text-sm font-medium text-zinc-400">The five-stage hiring loop</h3>
          <ol className="space-y-2 text-sm text-zinc-300">
            <li>
              <span className="mr-2 text-emerald-400">1.</span>
              <span className="font-medium">Broadcast</span>
              <span className="text-zinc-500"> · Agent A sends a job spec over AXL</span>
            </li>
            <li>
              <span className="mr-2 text-emerald-400">2.</span>
              <span className="font-medium">Discover</span>
              <span className="text-zinc-500"> · Identity Registry → candidates by capability</span>
            </li>
            <li>
              <span className="mr-2 text-emerald-400">3.</span>
              <span className="font-medium">Evaluate</span>
              <span className="text-zinc-500"> · Reputation Registry → ranked list (60/20/20)</span>
            </li>
            <li>
              <span className="mr-2 text-zinc-600">4.</span>
              <span className="font-medium text-zinc-500">Hire &amp; deliver</span>
              <span className="text-zinc-600"> · Phase 4 (AXL A2A roundtrip)</span>
            </li>
            <li>
              <span className="mr-2 text-zinc-600">5.</span>
              <span className="font-medium text-zinc-500">Settle &amp; record</span>
              <span className="text-zinc-600"> · Phase 5 (KeeperHub + write reputation)</span>
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
                  <CodeAddr>{network.identity_registry}</CodeAddr>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-zinc-500">Reputation Registry</dt>
                <dd>
                  <CodeAddr>{network.reputation_registry}</CodeAddr>
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
        </ul>
      </section>
    </div>
  );
}
