// wagmi + RainbowKit config — Phase 12.
//
// Visitors connect their own wallet (any RainbowKit-supported one — MetaMask,
// Rainbow, Coinbase Wallet, WalletConnect) and sign register / giveFeedback
// / setAgentURI txs from the dashboard. The hosted backend NEVER signs on
// behalf of users — server-side signing only happens with an operator
// PRIVATE_KEY, which the public Vercel deploy never has.
//
// Required env (set on Vercel before build):
//   NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
//      Get one at https://cloud.reown.com (sign in → New project → copy id).
//      Wagmi/RainbowKit work without it locally but the connection modal is
//      slightly less polished, so a real id is recommended for the demo.

import "@rainbow-me/rainbowkit/styles.css";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { base, baseSepolia } from "wagmi/chains";
import type { Config } from "wagmi";

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ||
  // Demo-only fallback — RainbowKit accepts any non-empty id and warns.
  // Replace with a real id before pushing to Vercel.
  "trustgate-demo";

// Lazy-build the config so WalletConnect's eager `indexedDB` access doesn't
// run during Next's static-page generation. Called once from <Providers>
// (a "use client" component), so by the time it runs we're definitely in a
// browser context.
let _config: Config | null = null;
export function getWagmiConfig(): Config {
  if (_config) return _config;
  _config = getDefaultConfig({
    appName: "TrustGate",
    projectId,
    // baseSepolia first → it's the chain TrustGate's deployed registries
    // live on for the hackathon. Mainnet is included so wallet-switching
    // for a future live deploy is one click instead of a rebuild.
    chains: [baseSepolia, base],
    ssr: true,
  });
  return _config;
}

export const SUPPORTED_CHAIN_ID = baseSepolia.id; // 84532
export const MAINNET_CHAIN_ID = base.id; // 8453
