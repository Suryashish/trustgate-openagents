"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type FindBestResult, type ScoredCandidate } from "@/lib/api";

// Pinned shortcut chips. The full typeahead is populated from the live
// /api/capabilities endpoint, but having a few fixed pivots avoids the
// "what's even valid here?" cold start.
const PINNED_CHIPS = ["agent_hiring", "defi", "swap", "summarise_documents", "testing"];

// Cheap Levenshtein for "did you mean…?". Runs on at most a few thousand
// strings client-side; far simpler than dragging in a fuzzy-match library.
function lev(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function Bar({ label, value, weight, color }: { label: string; value: number; weight: number; color: string }) {
  const widthRaw = `${Math.max(2, value * 100)}%`;
  return (
    <div className="text-[11px]">
      <div className="flex justify-between text-zinc-500">
        <span>{label}</span>
        <span className="tabular-nums">
          {value.toFixed(2)} × {weight.toFixed(2)} = {(value * weight).toFixed(3)}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded bg-zinc-800">
        <div className={`h-full rounded ${color}`} style={{ width: widthRaw }} />
      </div>
    </div>
  );
}

function Candidate({ c, rank }: { c: ScoredCandidate; rank: number }) {
  const winner = rank === 0;
  return (
    <li
      className={
        "rounded-lg border p-4 " +
        (winner
          ? "border-emerald-500/40 bg-emerald-500/5"
          : "border-zinc-800 bg-zinc-900/40")
      }
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-zinc-500">
            #{rank + 1} candidate · agent #{c.agent_id}
          </div>
          <div className="text-base font-medium">{c.name || "(no name)"}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">Score</div>
          <div className={"text-2xl tabular-nums " + (winner ? "text-emerald-300" : "")}>
            {c.score.toFixed(3)}
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-2">
        <Bar
          label={`Reputation (${c.reputation.toFixed(3)}, ${c.feedback_count} feedback)`}
          value={c.breakdown.reputation}
          weight={0.6}
          color="bg-emerald-400/80"
        />
        <Bar
          label={`Price ($${c.price.toFixed(4)})`}
          value={c.breakdown.price_score}
          weight={0.2}
          color="bg-sky-400/80"
        />
        <Bar
          label={`Latency (${c.latency_hint.toFixed(0)}s)`}
          value={c.breakdown.latency_score}
          weight={0.2}
          color="bg-violet-400/80"
        />
      </div>
    </li>
  );
}

export function HireTab() {
  const [capability, setCapability] = useState("defi");
  const [budget, setBudget] = useState(1.0);
  const [minRep, setMinRep] = useState(0.0);
  const [requireFeedback, setRequireFeedback] = useState(false);
  const [defaultLatency, setDefaultLatency] = useState(30);
  const [defaultPrice, setDefaultPrice] = useState(0);
  const [result, setResult] = useState<FindBestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // All capabilities advertised across the cached agent cards, with usage
  // counts. Loaded once on mount; used both for the typeahead datalist and
  // the "did you mean…?" suggestions when a search returns zero candidates.
  const [allCaps, setAllCaps] = useState<{ capability: string; count: number }[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .capabilities()
      .then((r) => {
        if (cancelled) return;
        setAllCaps(r.capabilities);
      })
      .catch(() => {
        // best-effort — fall back to pinned chips
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Top capabilities by agent count → the chips row. Falls back to the
  // pinned list when the cache is cold so the user still has something to
  // click.
  const topChips = useMemo(() => {
    if (allCaps.length === 0) return PINNED_CHIPS;
    const top = allCaps.slice(0, 8).map((c) => c.capability);
    // ensure the pinned chips appear too (de-duped) — keeps the UX stable
    // when the registry happens not to advertise our headline capabilities.
    const seen = new Set(top);
    for (const p of PINNED_CHIPS) {
      if (!seen.has(p)) {
        top.push(p);
        seen.add(p);
      }
    }
    return top.slice(0, 10);
  }, [allCaps]);

  // "Did you mean…?" — cheap edit-distance ranking against the full union.
  const suggestions = useMemo(() => {
    if (!capability || allCaps.length === 0) return [] as string[];
    const cap = capability.toLowerCase();
    if (allCaps.some((c) => c.capability === cap)) return [];
    return allCaps
      .map((c) => ({ c: c.capability, d: lev(cap, c.capability) }))
      .filter((x) => x.d > 0 && x.d <= Math.max(2, Math.floor(cap.length / 3)))
      .sort((a, b) => a.d - b.d)
      .slice(0, 5)
      .map((x) => x.c);
  }, [capability, allCaps]);

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    setRunning(true);
    setErr(null);
    setResult(null);
    try {
      const r = await api.findBest({
        capability,
        budget,
        min_reputation: minRep,
        require_feedback: requireFeedback,
        default_latency: defaultLatency,
        default_price: defaultPrice,
      });
      setResult(r);
    } catch (e) {
      setErr(`${(e as Error).message || e}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <form onSubmit={submit} className="space-y-4 rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <div>
          <label className="block text-xs uppercase tracking-wider text-zinc-500">
            Capability
            {allCaps.length > 0 && (
              <span className="ml-2 normal-case text-[10px] text-zinc-600">
                · {allCaps.length} unique across the cached registry
              </span>
            )}
          </label>
          <input
            list="trustgate-capabilities"
            value={capability}
            onChange={(e) => setCapability(e.target.value.trim().toLowerCase())}
            className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
          />
          <datalist id="trustgate-capabilities">
            {allCaps.map((c) => (
              <option key={c.capability} value={c.capability}>
                {c.count} agent{c.count === 1 ? "" : "s"}
              </option>
            ))}
          </datalist>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            {topChips.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setCapability(s)}
                title={s}
                className={
                  "rounded px-2 py-0.5 transition " +
                  (s === capability
                    ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30"
                    : "bg-zinc-800 text-zinc-400 hover:text-zinc-100")
                }
              >
                {s.length > 28 ? `${s.slice(0, 28)}…` : s}
              </button>
            ))}
          </div>
          {suggestions.length > 0 && (
            <div className="mt-2 text-[11px] text-zinc-500">
              Did you mean:{" "}
              {suggestions.map((s, i) => (
                <span key={s}>
                  {i > 0 && ", "}
                  <button
                    type="button"
                    onClick={() => setCapability(s)}
                    className="text-emerald-400 hover:underline"
                  >
                    {s}
                  </button>
                </span>
              ))}
              ?
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-500">Budget (USDC)</label>
            <input
              type="number"
              step="0.01"
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-500">Min reputation</label>
            <input
              type="number"
              step="0.01"
              min={0}
              max={1}
              value={minRep}
              onChange={(e) => setMinRep(Number(e.target.value))}
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-500">Default price ($)</label>
            <input
              type="number"
              step="0.01"
              value={defaultPrice}
              onChange={(e) => setDefaultPrice(Number(e.target.value))}
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wider text-zinc-500">Default latency (s)</label>
            <input
              type="number"
              step="1"
              value={defaultLatency}
              onChange={(e) => setDefaultLatency(Number(e.target.value))}
              className="mt-1 w-full rounded border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-sm"
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs text-zinc-400">
          <input
            type="checkbox"
            checked={requireFeedback}
            onChange={(e) => setRequireFeedback(e.target.checked)}
            className="accent-emerald-500"
          />
          require ≥1 feedback row
        </label>
        <button
          type="submit"
          disabled={running || !capability}
          className="w-full rounded bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? "Ranking…" : "Find best agent"}
        </button>
        <p className="text-[11px] text-zinc-500">
          Score = 0.60 × reputation + 0.20 × price_score + 0.20 × latency_score. Over-budget candidates are dropped before scoring.
        </p>
      </form>

      <div className="space-y-3">
        {err && (
          <div className="rounded border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-200">{err}</div>
        )}
        {result && result.candidates.length > 0 && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-[11px] uppercase tracking-wider text-emerald-300/80">
                Why this candidate?
              </div>
              <div className="text-[11px] tabular-nums text-zinc-500">
                {result.candidates.length} candidate{result.candidates.length === 1 ? "" : "s"} · ranked in{" "}
                {result.elapsed_seconds.toFixed(2)}s
              </div>
            </div>
            <div className="mt-2 text-sm text-emerald-100">{result.explanation}</div>
          </div>
        )}
        <ul className="space-y-3">
          {result?.candidates.map((c, i) => (
            <Candidate key={c.agent_id} c={c} rank={i} />
          ))}
        </ul>
        {result && result.candidates.length === 0 && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
            No candidates met the filters. Try a different capability or relax min-reputation.
          </div>
        )}
      </div>
    </div>
  );
}
