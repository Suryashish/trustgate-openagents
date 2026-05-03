"use client";

import { useEffect, useState } from "react";
import { api, type Agent, type FeedbackRow, type NetworkInfo, type Reputation } from "@/lib/api";
import { addressUrl, agentUrl, shortAddress, txUrl } from "@/lib/links";
import { TabHeader } from "./TabHeader";

function CapPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded bg-bh-paper-soft px-1.5 py-0.5 text-[10px] font-medium text-bh-ink-soft">
      {children}
    </span>
  );
}

function AgentRow({
  a,
  onSelect,
  selected,
  comparePinned,
  network,
}: {
  a: Agent;
  onSelect: (id: number, opts: { compare: boolean }) => void;
  selected: boolean;
  comparePinned: boolean;
  network: NetworkInfo | null;
}) {
  return (
    <li
      onClick={(e) => onSelect(a.agent_id, { compare: e.shiftKey || e.metaKey || e.ctrlKey })}
      className={
        "cursor-pointer rounded border p-3 text-sm transition " +
        (selected
          ? "border-bh-blue-bright/40 bg-bh-blue-bright/10"
          : comparePinned
            ? "border-bh-yellow/50 bg-bh-yellow/10"
            : "border-bh-line-strong bg-bh-paper/50 hover:border-bh-line-strong")
      }
      title={comparePinned ? "pinned for compare" : "click to inspect · shift-click to compare"}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium">
          <span className="text-bh-mute-2">#{a.agent_id}</span>{" "}
          <span>{a.name || "(no name)"}</span>
        </div>
        <a
          href={addressUrl(network, a.owner)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-[10px] text-bh-mute-2 hover:text-bh-blue hover:underline"
          title={a.owner}
        >
          {a.owner_ens ? (
            <span>
              <span className="text-bh-blue/80">{a.owner_ens}</span>
              <span className="ml-1 font-mono text-bh-mute-2">{shortAddress(a.owner)}</span>
            </span>
          ) : (
            <span className="font-mono">{shortAddress(a.owner)}</span>
          )}
        </a>
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {a.capabilities.slice(0, 6).map((c) => (
          <CapPill key={c}>{c}</CapPill>
        ))}
        {a.capabilities.length > 6 && (
          <span className="text-[10px] text-bh-mute-2">+{a.capabilities.length - 6}</span>
        )}
      </div>
    </li>
  );
}

function AgentDetail({ id, network }: { id: number; network: NetworkInfo | null }) {
  type Detail = Awaited<ReturnType<typeof api.agent>> & {
    feedback?: FeedbackRow[];
  };
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    setD(null);
    Promise.all([api.agent(id), api.feedback(id, 20).catch(() => ({ rows: [] as FeedbackRow[] }))])
      .then(([detail, fb]) => setD({ ...detail, feedback: fb.rows }))
      .catch((e) => setErr(`${e.message || e}`))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-sm text-bh-mute-2">Loading agent #{id}…</div>;
  if (err) return <div className="text-sm text-bh-red">{err}</div>;
  if (!d) return null;

  const card = d.card;
  const rep: Reputation = d.reputation;

  return (
    <div className="space-y-5 text-sm">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <div className="text-xs uppercase tracking-wider text-bh-mute-2">Agent #{d.agent_id}</div>
          <a
            href={agentUrl(d.agent_id)}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] text-bh-blue hover:underline"
          >
            view on 8004scan ↗
          </a>
        </div>
        <div className="text-xl font-semibold">{card?.name || "(no name)"}</div>
        {card?.description && (
          <p className="mt-1 max-w-3xl text-bh-ink-soft">{String(card.description)}</p>
        )}
      </div>

      <section className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-4">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-bh-mute-2">Reputation</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <div className="text-[10px] text-bh-mute-2">Score (0..1)</div>
            <div className="text-lg tabular-nums">{rep.score.toFixed(3)}</div>
          </div>
          <div>
            <div className="text-[10px] text-bh-mute-2">Avg raw</div>
            <div className="text-lg tabular-nums">{rep.average_raw.toFixed(1)}</div>
          </div>
          <div>
            <div className="text-[10px] text-bh-mute-2">Active feedback</div>
            <div className="text-lg tabular-nums">{rep.count}</div>
          </div>
          <div>
            <div className="text-[10px] text-bh-mute-2">Avg trust</div>
            <div className="text-lg tabular-nums">{rep.trust_level.toFixed(2)}</div>
          </div>
        </div>
        {d.feedback && d.feedback.length > 0 && (
          <div className="mt-4">
            <div className="mb-1 flex items-center justify-between text-[10px] text-bh-mute-2">
              <span>feedback timeline (oldest → newest)</span>
              <span>
                <span className="mr-2 inline-block h-1.5 w-3 rounded-sm bg-bh-blue-bright/80 align-middle"></span>positive ·{" "}
                <span className="mr-2 inline-block h-1.5 w-3 rounded-sm bg-bh-red/80 align-middle"></span>negative
              </span>
            </div>
            <div className="flex h-12 items-end gap-0.5 overflow-x-auto rounded border border-bh-line-strong bg-bh-canvas/60 p-1">
              {[...d.feedback]
                .sort((a, b) => a.index - b.index)
                .map((r) => {
                  // height proportional to abs(score) on [0..1] scale
                  const h = Math.max(6, Math.round(Math.abs(r.score - 0.5) * 2 * 38));
                  const positive = r.score >= 0.5;
                  return (
                    <div
                      key={`${r.client}-${r.index}`}
                      className={
                        "shrink-0 w-2 rounded-sm transition-opacity " +
                        (r.revoked
                          ? "bg-bh-paper-soft opacity-50"
                          : positive
                            ? "bg-bh-blue-bright/80 hover:bg-bh-blue-bright"
                            : "bg-bh-red/80 hover:bg-bh-red")
                      }
                      style={{ height: `${h}px` }}
                      title={`#${r.index} · score ${r.score.toFixed(2)} (raw ${r.score_raw}) · ${r.tag || "(no tag)"}${r.revoked ? " · revoked" : ""}`}
                    />
                  );
                })}
            </div>
          </div>
        )}
        {d.feedback && d.feedback.length > 0 && (
          <div className="mt-4 max-h-72 overflow-auto rounded border border-bh-line-strong">
            <table className="min-w-full text-xs">
              <thead className="bg-bh-paper text-bh-mute-2">
                <tr>
                  <th className="px-2 py-1.5 text-left">idx</th>
                  <th className="px-2 py-1.5 text-left">client</th>
                  <th className="px-2 py-1.5 text-left">score</th>
                  <th className="px-2 py-1.5 text-left">trust</th>
                  <th className="px-2 py-1.5 text-left">tag</th>
                  <th className="px-2 py-1.5 text-left">tag2</th>
                </tr>
              </thead>
              <tbody>
                {d.feedback.map((r) => (
                  <tr
                    key={`${r.client}-${r.index}`}
                    className={r.revoked ? "text-bh-mute-2 line-through" : "text-bh-ink-soft"}
                  >
                    <td className="px-2 py-1 tabular-nums">{r.index}</td>
                    <td className="px-2 py-1 font-mono">
                      <a
                        href={addressUrl(network, r.client)}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-bh-blue hover:underline"
                      >
                        {shortAddress(r.client)}
                      </a>
                    </td>
                    <td className="px-2 py-1 tabular-nums">{r.score_raw}</td>
                    <td className="px-2 py-1 tabular-nums">{r.trust_level}</td>
                    <td className="px-2 py-1">{r.tag}</td>
                    <td className="px-2 py-1">{r.tag2}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-4">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-bh-mute-2">Capabilities</h3>
        <div className="flex flex-wrap gap-1">
          {(card?.endpoints || [])
            .flatMap((ep) =>
              [...(ep.skills || []), ...(ep.capabilities || []), ...(ep.domains || [])].map((c) => c.toLowerCase())
            )
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .map((c) => (
              <CapPill key={c}>{c}</CapPill>
            ))}
        </div>
      </section>

      <section className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-4">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-bh-mute-2">Endpoints</h3>
        {(card?.endpoints || []).length === 0 ? (
          <p className="text-bh-mute-2">none advertised</p>
        ) : (
          <ul className="space-y-2">
            {(card?.endpoints || []).map((ep, i) => (
              <li key={i} className="rounded border border-bh-line-strong bg-bh-canvas/40 p-2 text-xs">
                <div className="text-bh-blue">{ep.name}</div>
                <div className="break-all font-mono text-bh-ink-soft">{ep.endpoint}</div>
                {ep.version && <div className="text-bh-mute-2">v{ep.version}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-4">
        <h3 className="mb-2 text-xs uppercase tracking-wider text-bh-mute-2">On-chain provenance</h3>
        <dl className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
          <div>
            <dt className="text-bh-mute-2">Owner</dt>
            <dd>
              {d.owner_ens && (
                <div className="text-bh-blue">{d.owner_ens}</div>
              )}
              <a
                href={addressUrl(network, d.owner)}
                target="_blank"
                rel="noreferrer"
                className="break-all font-mono text-bh-blue/80 hover:underline"
              >
                {d.owner}
              </a>
            </dd>
          </div>
          <div>
            <dt className="text-bh-mute-2">Block</dt>
            <dd className="tabular-nums">{d.block.toLocaleString()}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-bh-mute-2">tx</dt>
            <dd>
              {d.tx_hash && d.tx_hash !== "0x" + "0".repeat(64) ? (
                <a
                  href={txUrl(network, d.tx_hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-bh-blue hover:underline"
                >
                  {d.tx_hash}
                </a>
              ) : (
                <span className="font-mono text-bh-mute-2">{d.tx_hash}</span>
              )}
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-bh-mute-2">agentURI (registered)</dt>
            <dd className="break-all font-mono text-bh-mute">
              {d.agent_uri.length > 200 ? `${d.agent_uri.slice(0, 200)}…` : d.agent_uri}
            </dd>
          </div>
          {d.live_token_uri && d.live_token_uri !== d.agent_uri && (
            <div className="sm:col-span-2">
              <dt className="text-bh-ink">live tokenURI (current — drifted)</dt>
              <dd className="break-all font-mono text-bh-ink/80">
                {d.live_token_uri.length > 200 ? `${d.live_token_uri.slice(0, 200)}…` : d.live_token_uri}
              </dd>
            </div>
          )}
        </dl>
      </section>
    </div>
  );
}

export function AgentsTab({ network }: { network: NetworkInfo | null }) {
  const [capability, setCapability] = useState("");
  const [pendingCap, setPendingCap] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [compareWith, setCompareWith] = useState<number | null>(null);

  // Phase 11: top-N capability discovery pills above the filter input.
  // Lets a browser pivot from "I have no idea what to search" to a one-click
  // jump into a popular slice of the registry.
  const [topCaps, setTopCaps] = useState<{ capability: string; count: number }[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .capabilities()
      .then((r) => {
        if (cancelled) return;
        setTopCaps(r.capabilities.slice(0, 8));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setLoading(true);
    setErr(null);
    api
      .agents({ capability: capability || undefined, active: activeOnly, limit: 50 })
      .then((r) => {
        setAgents(r.agents);
        // re-select first agent whenever the list changes; if the previously
        // selected one is gone, drop the selection
        if (r.agents.length === 0) {
          setSelected(null);
          return;
        }
        setSelected((prev) =>
          prev != null && r.agents.some((a) => a.agent_id === prev) ? prev : r.agents[0].agent_id
        );
      })
      .catch((e) => setErr(`${e.message || e}`))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capability, activeOnly, reloadTick]);

  return (
    <div className="space-y-6">
      <TabHeader
        eyebrow="02 · agents"
        title="Browse the live registry"
        subtitle="Every agent registered on the ERC-8004 IdentityRegistry. Filter by capability, click to see the on-chain card and full reputation history. Shift-click to compare two agents side by side."
        glyph="circle"
        glyphColor="var(--bh-blue-bright)"
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <div className="space-y-3">
        {topCaps.length > 0 && (
          <div className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-3">
            <div className="mb-2 text-[10px] uppercase tracking-wider text-bh-mute-2">
              Browse by capability
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {topCaps.map((c) => (
                <button
                  key={c.capability}
                  type="button"
                  onClick={() => {
                    setPendingCap(c.capability);
                    setCapability(c.capability);
                  }}
                  className={
                    "rounded px-2 py-0.5 transition " +
                    (c.capability === capability
                      ? "bg-bh-blue-bright/25 text-bh-blue ring-1 ring-bh-blue-bright/40"
                      : "bg-bh-paper-soft text-bh-ink-soft hover:bg-bh-paper-soft")
                  }
                  title={`${c.count} agents advertise ${c.capability}`}
                >
                  {c.capability.length > 26 ? `${c.capability.slice(0, 26)}…` : c.capability}
                  <span className="ml-1 text-[10px] text-bh-mute-2">·{c.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const next = pendingCap.trim().toLowerCase();
            if (next === capability) {
              // same value — bump the reload tick so the user gets a re-fetch
              setReloadTick((t) => t + 1);
            } else {
              setCapability(next);
            }
          }}
          className="flex gap-2"
        >
          <input
            value={pendingCap}
            onChange={(e) => setPendingCap(e.target.value)}
            placeholder="filter capability — e.g. swap"
            className="flex-1 rounded border border-bh-line-strong bg-bh-canvas px-3 py-1.5 text-sm placeholder-bh-mute-2 focus:border-bh-blue-bright focus:outline-none"
          />
          <button
            type="submit"
            className="rounded bg-bh-blue-bright/25 px-3 py-1.5 text-sm text-bh-blue ring-1 ring-bh-blue-bright/40 hover:bg-bh-blue-bright/40"
          >
            Filter
          </button>
          {capability && (
            <button
              type="button"
              onClick={() => {
                setPendingCap("");
                setCapability("");
              }}
              className="rounded bg-bh-paper-soft px-2 py-1.5 text-xs text-bh-mute hover:text-bh-ink"
              title="Clear capability filter"
            >
              Clear
            </button>
          )}
        </form>
        <label className="flex items-center gap-2 text-xs text-bh-mute">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
            className="accent-bh-blue-bright"
          />
          active only
        </label>

        {loading && <div className="text-sm text-bh-mute-2">Loading…</div>}
        {err && <div className="text-sm text-bh-red">{err}</div>}

        <ul className="max-h-[70vh] space-y-2 overflow-auto pr-1">
          {agents.map((a) => (
            <AgentRow
              key={a.agent_id}
              a={a}
              onSelect={(id, opts) => {
                if (opts.compare) {
                  // shift / cmd / ctrl click → toggle as the compare slot.
                  // Toggle off if it's already pinned; ignore if it equals the
                  // primary selection (no point comparing an agent to itself).
                  if (id === selected) return;
                  setCompareWith((cur) => (cur === id ? null : id));
                } else {
                  setSelected(id);
                  // If the new primary equals the compare pin, clear the pin.
                  setCompareWith((cur) => (cur === id ? null : cur));
                }
              }}
              selected={selected === a.agent_id}
              comparePinned={compareWith === a.agent_id}
              network={network}
            />
          ))}
          {!loading && agents.length === 0 && (
            <li className="text-sm text-bh-mute-2">No agents matched.</li>
          )}
        </ul>
      </div>

      <div
        className={
          compareWith != null
            ? "grid gap-3 rounded-lg border border-bh-line-strong bg-bh-paper/50 p-4 lg:grid-cols-2"
            : "rounded-lg border border-bh-line-strong bg-bh-paper/50 p-4"
        }
      >
        {selected != null ? (
          <div className={compareWith != null ? "border-r border-bh-line-strong pr-3 lg:pr-4" : ""}>
            <AgentDetail id={selected} network={network} />
          </div>
        ) : (
          <div className="text-sm text-bh-mute-2">
            Click an agent to inspect. <span className="text-bh-mute-2">Shift-click a second agent to compare side-by-side.</span>
          </div>
        )}
        {compareWith != null && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-wider text-bh-blue-bright">comparing with</div>
              <button
                onClick={() => setCompareWith(null)}
                className="rounded bg-bh-paper-soft/80 px-2 py-0.5 text-[10px] text-bh-mute ring-1 ring-bh-line-strong hover:text-bh-ink"
              >
                Close
              </button>
            </div>
            <AgentDetail id={compareWith} network={network} />
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
