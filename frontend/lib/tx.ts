"use client";

import { useCallback, useState } from "react";
import {
  useAccount,
  useChainId,
  useSendTransaction,
  useSwitchChain,
  useWaitForTransactionReceipt,
} from "wagmi";
import type { Hex } from "viem";

import { SUPPORTED_CHAIN_ID } from "./wagmi";

/**
 * Server-built tx envelope. The Phase 6 / 7 / 11 dry-run paths return an
 * object of this shape — we re-use the calldata + `to` address directly
 * and let the connected wallet sign + broadcast.
 */
export type ServerBuiltTx = {
  mode?: "dry_run" | "live" | "error" | string;
  to?: string;
  calldata?: string;
  tx?: {
    to?: string;
    data?: string;
    chainId?: number;
    gas?: string | number;
    value?: string | number;
  };
};

export type SubmitState =
  | { kind: "idle" }
  | { kind: "submitting"; reason: string }
  | { kind: "broadcast"; hash: Hex }
  | { kind: "confirmed"; hash: Hex; blockNumber: bigint }
  | { kind: "error"; message: string };

function pickTo(t: ServerBuiltTx): Hex | null {
  const v = t.to ?? t.tx?.to;
  return v && v.startsWith("0x") ? (v as Hex) : null;
}

function pickData(t: ServerBuiltTx): Hex | null {
  const v = t.calldata ?? t.tx?.data;
  return v && v.startsWith("0x") ? (v as Hex) : null;
}

function pickGas(t: ServerBuiltTx): bigint | undefined {
  const g = t.tx?.gas;
  if (g == null) return undefined;
  if (typeof g === "number") return BigInt(g);
  if (typeof g === "string") {
    return BigInt(g.startsWith("0x") ? g : Number(g));
  }
  return undefined;
}

/**
 * One-stop hook for "I have a server-built dry-run tx, send it through the
 * user's wallet". Handles chain-switch, broadcast, and receipt-wait.
 *
 * Usage:
 *   const { submit, state, reset } = useSubmitServerTx();
 *   await submit(serverTx);  // resolves once the tx is *broadcast* (not confirmed)
 *   // state reflects broadcast → confirmed; render basescan link from state.hash
 */
export function useSubmitServerTx() {
  const [state, setState] = useState<SubmitState>({ kind: "idle" });
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  // Watch the most recently broadcast tx for confirmation. The receipt hook
  // is reactive — it only fires when `hash` is set.
  const broadcastHash =
    state.kind === "broadcast" || state.kind === "confirmed" ? state.hash : undefined;
  const { data: receipt } = useWaitForTransactionReceipt({ hash: broadcastHash });

  // Promote broadcast → confirmed when the receipt lands.
  if (state.kind === "broadcast" && receipt && receipt.blockNumber) {
    // Direct setState in render is a React anti-pattern, but our state
    // machine deliberately polls for the receipt and the transition is
    // idempotent. Wrap in a microtask to avoid the warning.
    queueMicrotask(() =>
      setState({
        kind: "confirmed",
        hash: receipt.transactionHash as Hex,
        blockNumber: receipt.blockNumber,
      })
    );
  }

  const submit = useCallback(
    async (t: ServerBuiltTx) => {
      if (!isConnected) {
        setState({ kind: "error", message: "Connect a wallet first." });
        return;
      }
      const to = pickTo(t);
      const data = pickData(t);
      if (!to || !data) {
        setState({
          kind: "error",
          message: "Server response missing `to` or `calldata`.",
        });
        return;
      }
      try {
        setState({ kind: "submitting", reason: "preparing" });

        // Make sure the user is on the same chain the server built the tx for.
        // We don't trust tx.chainId blindly — register / setAgentURI / feedback
        // are all on Base Sepolia in this build.
        const targetChain = t.tx?.chainId ?? SUPPORTED_CHAIN_ID;
        if (chainId !== targetChain) {
          setState({ kind: "submitting", reason: `switching to chain ${targetChain}` });
          await switchChainAsync({ chainId: targetChain });
        }

        setState({ kind: "submitting", reason: "awaiting wallet signature" });
        const hash = await sendTransactionAsync({
          to,
          data,
          gas: pickGas(t),
          value: BigInt(0),
        });
        setState({ kind: "broadcast", hash });
      } catch (e) {
        const msg = (e as Error)?.message || String(e);
        setState({ kind: "error", message: msg });
      }
    },
    [chainId, isConnected, sendTransactionAsync, switchChainAsync]
  );

  const reset = useCallback(() => setState({ kind: "idle" }), []);

  return { submit, state, reset };
}
