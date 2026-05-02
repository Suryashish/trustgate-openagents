"use client";

import { useEffect, useState } from "react";
import { api, type SelfStatus, type SelfRegisterResult, type EnsResolveResult } from "@/lib/api";

function ModeBadge({ live, label }: { live: boolean; label: string }) {
  return (
    <span
      className={
        "rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " +
        (live
          ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-400/30"
          : "bg-amber-500/15 text-amber-300 ring-1 ring-amber-400/30")
      }
    >
      {label}
    </span>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="max-h-72 overflow-auto rounded bg-zinc-950/60 p-3 text-[11px] leading-relaxed text-zinc-300 ring-1 ring-zinc-800">
      {children}
    </pre>
  );
}

export function SelfTab() {
  const [status, setStatus] = useState<SelfStatus | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  const [axlPubkey, setAxlPubkey] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [registerResult, setRegisterResult] = useState<SelfRegisterResult | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  const [ensInput, setEnsInput] = useState("");
  const [ensResult, setEnsResult] = useState<EnsResolveResult | null>(null);
  const [ensError, setEnsError] = useState<string | null>(null);
  const [ensLoading, setEnsLoading] = useState(false);

  const refresh = async (kwargs: { axl_pubkey?: string } = {}) => {
    try {
      setBootError(null);
      const s = await api.selfStatus(kwargs);
      setStatus(s);
    } catch (e) {
      setBootError((e as Error).message || String(e));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const onRegister = async () => {
    setRegistering(true);
    setRegisterError(null);
    setRegisterResult(null);
    try {
      const res = await api.selfRegister({
        axl_pubkey: axlPubkey || undefined,
        api_url: apiUrl || undefined,
      });
      setRegisterResult(res);
    } catch (e) {
      setRegisterError((e as Error).message || String(e));
    } finally {
      setRegistering(false);
    }
  };

  const onResolveEns = async () => {
    setEnsLoading(true);
    setEnsError(null);
    setEnsResult(null);
    try {
      const looksLikeAddr = /^0x[0-9a-fA-F]{40}$/.test(ensInput);
      const res = await api.ensResolve(
        looksLikeAddr ? { address: ensInput } : { name: ensInput }
      );
      setEnsResult(res);
    } catch (e) {
      setEnsError((e as Error).message || String(e));
    } finally {
      setEnsLoading(false);
    }
  };

  const signerLive = status?.signer.private_key_configured ?? false;

  return (
    <div className="space-y-8">
      {bootError && (
        <pre className="whitespace-pre-wrap rounded border border-rose-900 bg-rose-950/40 p-4 text-sm text-rose-200">
          {bootError}
        </pre>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-400">TrustGate signer</h3>
            <ModeBadge live={signerLive} label={signerLive ? "live" : "dry-run"} />
          </div>
          {status ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-xs text-zinc-500">private key</dt>
                <dd className="text-zinc-200">
                  {status.signer.private_key_configured ? "configured" : "not set"}
                </dd>
              </div>
              {status.signer.address && (
                <div className="flex justify-between">
                  <dt className="text-xs text-zinc-500">address</dt>
                  <dd className="break-all font-mono text-[11px] text-emerald-300">
                    {status.signer.address}
                  </dd>
                </div>
              )}
              {status.signer.balance_eth !== undefined && (
                <div className="flex justify-between">
                  <dt className="text-xs text-zinc-500">balance</dt>
                  <dd className="text-zinc-200">{status.signer.balance_eth.toFixed(5)} ETH</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-xs text-zinc-500">ENS name (mainnet)</dt>
                <dd className="text-zinc-200">
                  {status.signer.ens_name ? (
                    <span className="text-emerald-300">{status.signer.ens_name}</span>
                  ) : (
                    <span className="text-zinc-500">none / unreachable</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-xs text-zinc-500">network</dt>
                <dd className="text-zinc-200">
                  {status.network} (chain {status.chain_id})
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-xs text-zinc-500">already-owned ids</dt>
                <dd className="text-zinc-200">
                  {status.owned_agent_ids.length === 0
                    ? "(none on this network)"
                    : `#${status.owned_agent_ids.join(", #")}`}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-zinc-500">Loading…</p>
          )}
          {!signerLive && (
            <p className="mt-3 text-[11px] text-zinc-500">
              Set <code className="rounded bg-zinc-800 px-1">PRIVATE_KEY</code> in{" "}
              <code className="rounded bg-zinc-800 px-1">.env</code> (next to{" "}
              <code className="rounded bg-zinc-800 px-1">app/</code>) to broadcast a real
              <code className="ml-1 rounded bg-zinc-800 px-1">register(string)</code> tx.
              Faucet:{" "}
              <a
                href="https://www.alchemy.com/faucets/base-sepolia"
                target="_blank"
                rel="noreferrer"
                className="text-emerald-400 hover:underline"
              >
                alchemy.com/faucets/base-sepolia
              </a>
            </p>
          )}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
          <h3 className="mb-3 text-sm font-medium text-zinc-400">Agent card preview</h3>
          {status ? (
            <>
              <p className="mb-2 text-xs text-zinc-500">
                {status.agent_uri_bytes} bytes · stored as{" "}
                <code className="rounded bg-zinc-800 px-1">data:application/json;base64,…</code>
              </p>
              <CodeBlock>{JSON.stringify(status.card, null, 2)}</CodeBlock>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Loading…</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="mb-2 text-sm font-medium text-zinc-400">Register TrustGate as ERC-8004 agent</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Calls <code className="rounded bg-zinc-800 px-1">register(string agentURI)</code> on{" "}
          <code className="break-all font-mono text-emerald-300">{status?.identity_registry || "…"}</code>.
          Endpoints below are stamped into the card before signing — leave both blank to register a
          card with no AXL/HTTP endpoint (you can set them later via{" "}
          <code className="rounded bg-zinc-800 px-1">setAgentURI</code>).
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs">
            <span className="text-zinc-400">AXL public key (optional)</span>
            <input
              value={axlPubkey}
              onChange={(e) => setAxlPubkey(e.target.value)}
              placeholder="paste from `bash scripts/start_axl_nodes.sh`"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950/40 px-2 py-1.5 font-mono text-[12px] text-zinc-200"
            />
          </label>
          <label className="block text-xs">
            <span className="text-zinc-400">HTTP endpoint (optional)</span>
            <input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="e.g. https://trustgate.example.com"
              className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950/40 px-2 py-1.5 font-mono text-[12px] text-zinc-200"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={onRegister}
            disabled={registering}
            className="rounded bg-emerald-500/20 px-3 py-1.5 text-sm font-medium text-emerald-200 ring-1 ring-emerald-400/30 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            {registering ? "Submitting…" : signerLive ? "Sign & broadcast" : "Run dry-run"}
          </button>
          <button
            onClick={() => refresh({ axl_pubkey: axlPubkey || undefined })}
            className="rounded bg-zinc-800/60 px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-800"
          >
            Refresh card preview
          </button>
        </div>
        {registerError && (
          <pre className="mt-3 whitespace-pre-wrap rounded border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">
            {registerError}
          </pre>
        )}
        {registerResult && (
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-zinc-500">mode:</span>
              <ModeBadge
                live={registerResult.mode === "live"}
                label={registerResult.mode === "live" ? "broadcast" : "dry-run"}
              />
            </div>
            {registerResult.mode === "live" && registerResult.tx_hash && (
              <p className="text-zinc-300">
                tx:{" "}
                <a
                  href={`https://sepolia.basescan.org/tx/${registerResult.tx_hash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-emerald-300 hover:underline"
                >
                  {registerResult.tx_hash}
                </a>
                {registerResult.agent_id !== undefined && (
                  <span className="ml-2 rounded bg-emerald-500/20 px-2 py-0.5 text-emerald-200 ring-1 ring-emerald-400/30">
                    new agent #{registerResult.agent_id}
                  </span>
                )}
              </p>
            )}
            {registerResult.mode === "dry_run" && (
              <>
                <p className="text-zinc-400">
                  to:{" "}
                  <code className="break-all font-mono text-emerald-300">{registerResult.to}</code>
                </p>
                <p className="text-zinc-400">
                  selector: <code className="font-mono text-emerald-300">0xf2c298be</code>{" "}
                  <span className="text-zinc-500">(register(string))</span>
                </p>
                <details>
                  <summary className="cursor-pointer text-zinc-400 hover:text-zinc-200">
                    show calldata ({registerResult.calldata?.length ?? 0} chars)
                  </summary>
                  <CodeBlock>{registerResult.calldata}</CodeBlock>
                </details>
              </>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-5">
        <h3 className="mb-2 text-sm font-medium text-zinc-400">ENS resolver</h3>
        <p className="mb-3 text-xs text-zinc-500">
          Reverse-resolves an Ethereum address to its primary ENS name (or forward-resolves a
          name to an address). ENS contracts live on Ethereum mainnet, so this hits the
          <code className="ml-1 rounded bg-zinc-800 px-1">ENS_RPC_URL</code> endpoint, not the
          Base RPC.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={ensInput}
            onChange={(e) => setEnsInput(e.target.value)}
            placeholder="0x… or name.eth"
            className="flex-1 rounded border border-zinc-700 bg-zinc-950/40 px-2 py-1.5 font-mono text-[12px] text-zinc-200"
          />
          <button
            onClick={onResolveEns}
            disabled={ensLoading || !ensInput}
            className="rounded bg-zinc-800/60 px-3 py-1.5 text-sm text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
          >
            {ensLoading ? "Resolving…" : "Resolve"}
          </button>
        </div>
        {ensError && (
          <pre className="mt-3 whitespace-pre-wrap rounded border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">
            {ensError}
          </pre>
        )}
        {ensResult && (
          <dl className="mt-3 space-y-1 text-xs">
            {ensResult.address && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">address</dt>
                <dd className="break-all font-mono text-emerald-300">{ensResult.address}</dd>
              </div>
            )}
            {ensResult.name !== undefined && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">primary name</dt>
                <dd className="text-zinc-200">{ensResult.name || "(none)"}</dd>
              </div>
            )}
            {ensResult.forward_address && (
              <div className="flex justify-between">
                <dt className="text-zinc-500">forward → address</dt>
                <dd className="break-all font-mono text-emerald-300">{ensResult.forward_address}</dd>
              </div>
            )}
          </dl>
        )}
      </section>
    </div>
  );
}
