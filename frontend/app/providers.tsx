"use client";

import { useState } from "react";
import { WagmiProvider } from "wagmi";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { getWagmiConfig } from "@/lib/wagmi";

/**
 * Top-level provider stack used by app/layout.tsx. Order matters:
 *   WagmiProvider              — exposes the wallet config to wagmi hooks
 *     QueryClientProvider      — wagmi v2 requires react-query underneath it
 *       RainbowKitProvider     — the connection modal + theme
 *
 * Pairs with `export const dynamic = "force-dynamic"` on the root page,
 * which keeps Next.js from pre-rendering it during `next build` — the
 * WalletConnect transport touches `indexedDB` in its constructor, which
 * is undefined during SSR static-page generation. The dashboard is a
 * client-side dynamic app anyway (everything fetches from the API at
 * runtime), so static pre-rendering bought us nothing.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // Lazy-initialise so the QueryClient survives Fast Refresh + remounts.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 30_000,
          },
        },
      })
  );

  // Build the wagmi config inside the component so WalletConnect's eager
  // browser-API access only fires when this component actually mounts (the
  // dynamic-import wrapper in ClientProviders.tsx ensures that's
  // client-side only).
  const [config] = useState(() => getWagmiConfig());

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#10b981", // emerald-500 — matches the dashboard
            borderRadius: "small",
            fontStack: "system",
          })}
          showRecentTransactions
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
