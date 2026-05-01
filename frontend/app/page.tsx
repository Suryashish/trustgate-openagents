"use client";

import { useEffect, useState } from "react";
import { OverviewTab } from "./components/OverviewTab";
import { AgentsTab } from "./components/AgentsTab";
import { HireTab } from "./components/HireTab";
import { AxlTab } from "./components/AxlTab";
import { api, type CacheStatus, type NetworkInfo } from "@/lib/api";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "agents", label: "Agents" },
  { id: "hire", label: "Hire" },
  { id: "axl", label: "AXL Bridge" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function Home() {
  const [tab, setTab] = useState<TabId>("overview");
  const [network, setNetwork] = useState<NetworkInfo | null>(null);
  const [cache, setCache] = useState<CacheStatus | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.network(), api.cacheStatus()])
      .then(([n, c]) => {
        if (cancelled) return;
        setNetwork(n);
        setCache(c);
      })
      .catch((e) =>
        setBootError(
          `${e.message || e}\n\nIs the TrustGate API running? Try:\n` +
            `  cd app && PYTHONPATH=. ../.venv/bin/python server.py`
        )
      );
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-800 bg-zinc-900/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              TrustGate <span className="text-emerald-400">·</span>{" "}
              <span className="font-normal text-zinc-400">ERC-8004 Agent Hiring Manager</span>
            </h1>
            <p className="text-xs text-zinc-500">
              {network
                ? `${network.network} · chain ${network.chain_id} · head ${network.head_block.toLocaleString()}`
                : bootError
                ? <span className="text-rose-400">API offline</span>
                : "connecting…"}
            </p>
          </div>
          <nav className="flex gap-1 rounded-lg bg-zinc-800/60 p-1 text-sm">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={
                  "rounded px-3 py-1.5 transition " +
                  (tab === t.id
                    ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/30"
                    : "text-zinc-400 hover:text-zinc-200")
                }
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {bootError ? (
          <pre className="whitespace-pre-wrap rounded border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">
            {bootError}
          </pre>
        ) : tab === "overview" ? (
          <OverviewTab network={network} cache={cache} />
        ) : tab === "agents" ? (
          <AgentsTab />
        ) : tab === "hire" ? (
          <HireTab />
        ) : (
          <AxlTab />
        )}
      </main>

      <footer className="border-t border-zinc-800 px-6 py-4 text-center text-xs text-zinc-600">
        Read-only dashboard · data from live Base Sepolia · AXL bridge calls forwarded through the local
        TrustGate API
      </footer>
    </div>
  );
}
