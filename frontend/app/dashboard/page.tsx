"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { OverviewTab } from "../components/OverviewTab";
import { AgentsTab } from "../components/AgentsTab";
import { HireTab } from "../components/HireTab";
import { AxlTab } from "../components/AxlTab";
import { SettleTab } from "../components/SettleTab";
import { SelfTab } from "../components/SelfTab";
import { api, type CacheStatus, type NetworkInfo } from "@/lib/api";

const TABS = [
  { id: "overview", label: "Overview", glyph: "▢" },
  { id: "agents",   label: "Agents",   glyph: "○" },
  { id: "hire",     label: "Hire",     glyph: "△" },
  { id: "axl",      label: "AXL Bridge", glyph: "▢" },
  { id: "settle",   label: "Settle",   glyph: "○" },
  { id: "self",     label: "Self",     glyph: "△" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function Logomark() {
  return (
    <svg width="28" height="28" viewBox="0 0 34 34" aria-hidden>
      <rect x="1" y="1" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="17" r="9" fill="var(--bh-red)" />
      <rect x="13" y="13" width="8" height="8" fill="var(--bh-yellow)" />
    </svg>
  );
}

export default function Dashboard() {
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
    <div className="relative flex min-h-screen flex-1 flex-col bg-bh-canvas text-bh-ink">
      {/* Subtle paper grain over the whole app — gives the same texture as the landing */}
      <div className="pointer-events-none absolute inset-0 bh-grain opacity-60" aria-hidden />

      <header className="relative z-10 border-b border-bh-line-strong bg-bh-paper/70 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-6 py-4">
          <Link href="/" className="group flex items-center gap-3" aria-label="Back to landing">
            <Logomark />
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="font-semibold tracking-tight">TrustGate</span>
                <span className="hidden sm:inline-block rounded-sm bg-bh-ink/85 px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-widest text-bh-canvas">
                  dashboard
                </span>
              </div>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-[0.25em] text-bh-mute-2">
                {network ? (
                  <>
                    {network.network} · chain {network.chain_id} · head{" "}
                    <span className="text-bh-ink-soft">{network.head_block.toLocaleString()}</span>
                  </>
                ) : bootError ? (
                  <span className="text-bh-red">api offline</span>
                ) : (
                  "connecting…"
                )}
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-3">
            <ConnectButton
              accountStatus={{ smallScreen: "avatar", largeScreen: "full" }}
              chainStatus="icon"
              showBalance={false}
            />
          </div>
        </div>

        {/* Tab strip — full width, sharp Bauhaus edges */}
        <nav
          className="mx-auto flex max-w-7xl flex-wrap items-center gap-px overflow-x-auto border-t border-bh-line-strong bg-bh-line-strong/60 px-1 text-sm"
          aria-label="Dashboard sections"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={
                  "group relative flex items-center gap-2 px-4 py-2.5 font-medium tracking-tight transition " +
                  (active
                    ? "bg-bh-canvas text-bh-ink"
                    : "bg-bh-paper-soft/40 text-bh-mute hover:bg-bh-canvas/70 hover:text-bh-ink")
                }
                aria-current={active ? "page" : undefined}
              >
                <span
                  aria-hidden
                  className={
                    "font-mono text-[11px] " +
                    (active ? "text-bh-red" : "text-bh-mute-2 group-hover:text-bh-mute")
                  }
                >
                  {t.glyph}
                </span>
                <span>{t.label}</span>
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 -bottom-px h-[3px] bg-bh-red"
                  />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {bootError ? (
          <pre className="whitespace-pre-wrap rounded border border-bh-red/40 bg-bh-red/10 p-4 text-sm text-bh-red">
            {bootError}
          </pre>
        ) : tab === "overview" ? (
          <OverviewTab network={network} cache={cache} />
        ) : tab === "agents" ? (
          <AgentsTab network={network} />
        ) : tab === "hire" ? (
          <HireTab />
        ) : tab === "axl" ? (
          <AxlTab />
        ) : tab === "settle" ? (
          <SettleTab />
        ) : (
          <SelfTab />
        )}
      </main>

      <footer className="relative z-10 border-t border-bh-line-strong bg-bh-paper/40 px-6 py-5 text-center text-xs text-bh-mute-2 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <span className="font-mono uppercase tracking-[0.25em]">
            read-only · live base sepolia
          </span>
          <span className="font-mono uppercase tracking-[0.25em] flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-bh-red bh-anim-blink" />
            built in public
          </span>
        </div>
      </footer>
    </div>
  );
}
