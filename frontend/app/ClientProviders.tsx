"use client";

import dynamic from "next/dynamic";

// Dynamically import the wallet provider tree with SSR disabled. Wagmi's
// WalletConnect transport touches `indexedDB` at construction time, which
// throws during Next's static-page generation. Loading Providers only on
// the client side bypasses that — the dashboard is fully dynamic anyway
// (every panel fetches live data on mount), so we don't lose anything by
// skipping pre-render of these branches.
const Providers = dynamic(() => import("./providers").then((m) => m.Providers), {
  ssr: false,
  // Empty fallback while wagmi loads — children render unwrapped, which
  // is fine because every wagmi-aware component degrades to the
  // not-connected branch when no provider is present (or short-circuits
  // before hooks fire — see SetupWizard etc.).
  loading: () => null,
});

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
