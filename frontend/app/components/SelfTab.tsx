"use client";

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import {
  api,
  API_BASE,
  type SelfStatus,
  type SelfRegisterResult,
  type SelfUpdateCardResult,
  type EnsResolveResult,
} from "@/lib/api";
import { addressUrl, agentUrl, txUrl } from "@/lib/links";
import { useSubmitServerTx, type SubmitState } from "@/lib/tx";

function ModeBadge({ live, label }: { live: boolean; label: string }) {
  return (
    <span
      className={
        "rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider " +
        (live
          ? "bg-bh-blue-bright/25 text-bh-blue ring-1 ring-bh-blue-bright/40"
          : "bg-bh-yellow/20 text-bh-ink ring-1 ring-bh-yellow/50")
      }
    >
      {label}
    </span>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="max-h-72 overflow-auto rounded bg-bh-canvas/60 p-3 text-[11px] leading-relaxed text-bh-ink-soft ring-1 ring-bh-line-strong">
      {children}
    </pre>
  );
}

/**
 * Renders the live state of a wallet-driven tx (used for register +
 * setAgentURI + giveFeedback). Stays empty when idle so the panel doesn't
 * grow when no wallet path is active.
 */
function WalletSubmitStatus({
  state,
  chainId,
  followUpLabel,
}: {
  state: SubmitState;
  chainId: number;
  followUpLabel?: string;
}) {
  if (state.kind === "idle") return null;
  return (
    <div className="mt-3 rounded border border-bh-blue-bright/40 bg-bh-blue-bright/10 p-3 text-xs">
      {state.kind === "submitting" && (
        <div className="text-bh-ink">⏳ {state.reason}…</div>
      )}
      {state.kind === "broadcast" && (
        <div>
          <div className="text-bh-blue">✓ broadcast</div>
          <a
            href={txUrl({ chain_id: chainId }, state.hash)}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-bh-blue hover:underline"
          >
            {state.hash}
          </a>
          <div className="mt-1 text-bh-mute-2">waiting for confirmation…</div>
        </div>
      )}
      {state.kind === "confirmed" && (
        <div>
          <div className="text-bh-blue">✓ confirmed in block #{state.blockNumber.toString()}</div>
          <a
            href={txUrl({ chain_id: chainId }, state.hash)}
            target="_blank"
            rel="noreferrer"
            className="break-all font-mono text-bh-blue hover:underline"
          >
            {state.hash}
          </a>
          {followUpLabel && <div className="mt-1 text-bh-mute-2">{followUpLabel}</div>}
        </div>
      )}
      {state.kind === "error" && (
        <pre className="whitespace-pre-wrap text-bh-red">{state.message}</pre>
      )}
    </div>
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

  // Wallet path. When a visitor has connected their own wallet, we always
  // ask the server for dry-run calldata, then submit it through wagmi —
  // server-side signing is reserved for the operator (the team running the
  // backend with PRIVATE_KEY set).
  const { isConnected, address: walletAddress } = useAccount();
  const registerSubmit = useSubmitServerTx();
  const updateSubmit = useSubmitServerTx();

  const [updateAgentId, setUpdateAgentId] = useState<number | null>(null);
  const [updateResult, setUpdateResult] = useState<SelfUpdateCardResult | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

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

  // Auto-fill the AXL pubkey from n1's topology and the HTTP endpoint from
  // the API base, so users registering the local stack as TrustGate don't
  // have to know any of these values up-front. We only fill when the field
  // is empty — never overwrite user typing.
  useEffect(() => {
    let cancelled = false;
    if (!axlPubkey) {
      api
        .axlTopology(9002)
        .then((t) => {
          if (cancelled) return;
          const pk = t.topology?.our_public_key;
          if (pk) setAxlPubkey((cur) => (cur ? cur : pk));
        })
        .catch(() => {});
    }
    if (!apiUrl) {
      // The dashboard knows where the API is — the same value it fetches
      // from. Pre-fill that as the published HTTP endpoint.
      setApiUrl((cur) => (cur ? cur : API_BASE));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Default the Update-card target to the first owned id.
  useEffect(() => {
    if (updateAgentId == null && status?.owned_agent_ids?.length) {
      setUpdateAgentId(status.owned_agent_ids[0]);
    }
  }, [status, updateAgentId]);

  const onUpdateCard = async (mode: "dry-run" | "wallet" | "server") => {
    if (updateAgentId == null) return;
    setUpdating(true);
    setUpdateError(null);
    setUpdateResult(null);
    updateSubmit.reset();
    try {
      // Wallet broadcasts always go through dry_run + wagmi.
      const dry_run = mode !== "server";
      const res = await api.selfUpdateCard({
        agent_id: updateAgentId,
        axl_pubkey: axlPubkey || undefined,
        api_url: apiUrl || undefined,
        dry_run,
      });
      setUpdateResult(res);
      if (mode === "wallet" && res.mode === "dry_run") {
        await updateSubmit.submit(res);
      }
    } catch (e) {
      setUpdateError((e as Error).message || String(e));
    } finally {
      setUpdating(false);
    }
  };

  const onRegister = async () => {
    setRegistering(true);
    setRegisterError(null);
    setRegisterResult(null);
    registerSubmit.reset();
    try {
      // When a wallet is connected, always force dry-run on the server so
      // we get calldata + the contract address back, and submit through
      // wagmi. When no wallet is connected, the existing behaviour stands —
      // the server signs if PRIVATE_KEY is set, otherwise returns calldata.
      const res = await api.selfRegister({
        axl_pubkey: axlPubkey || undefined,
        api_url: apiUrl || undefined,
        dry_run: isConnected,
      });
      setRegisterResult(res);
      if (isConnected && res.mode === "dry_run") {
        await registerSubmit.submit(res);
      }
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
        <pre className="whitespace-pre-wrap rounded border border-bh-red/40 bg-bh-red/10 p-4 text-sm text-bh-red">
          {bootError}
        </pre>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-bh-mute">TrustGate signer</h3>
            <ModeBadge live={signerLive} label={signerLive ? "live" : "dry-run"} />
          </div>
          {status ? (
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-xs text-bh-mute-2">private key</dt>
                <dd className="text-bh-ink">
                  {status.signer.private_key_configured ? "configured" : "not set"}
                </dd>
              </div>
              {status.signer.address && (
                <div className="flex justify-between">
                  <dt className="text-xs text-bh-mute-2">address</dt>
                  <dd>
                    <a
                      href={addressUrl({ chain_id: status.chain_id }, status.signer.address)}
                      target="_blank"
                      rel="noreferrer"
                      className="break-all font-mono text-[11px] text-bh-blue hover:underline"
                    >
                      {status.signer.address}
                    </a>
                  </dd>
                </div>
              )}
              {status.signer.balance_eth !== undefined && (
                <div className="flex justify-between">
                  <dt className="text-xs text-bh-mute-2">balance</dt>
                  <dd className="text-bh-ink">{status.signer.balance_eth.toFixed(5)} ETH</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-xs text-bh-mute-2">ENS name (mainnet)</dt>
                <dd className="text-bh-ink">
                  {status.signer.ens_name ? (
                    <span className="text-bh-blue">{status.signer.ens_name}</span>
                  ) : (
                    <span className="text-bh-mute-2">none / unreachable</span>
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-xs text-bh-mute-2">network</dt>
                <dd className="text-bh-ink">
                  {status.network} (chain {status.chain_id})
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-xs text-bh-mute-2">already-owned ids</dt>
                <dd className="text-bh-ink">
                  {status.owned_agent_ids.length === 0
                    ? "(none on this network)"
                    : status.owned_agent_ids.map((id, i) => (
                        <span key={id}>
                          {i > 0 && ", "}
                          <a
                            href={agentUrl(id)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-bh-blue hover:underline"
                          >
                            #{id}
                          </a>
                        </span>
                      ))}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-bh-mute-2">Loading…</p>
          )}
          {!signerLive && (
            <p className="mt-3 text-[11px] text-bh-mute-2">
              Set <code className="rounded bg-bh-paper-soft px-1">PRIVATE_KEY</code> in{" "}
              <code className="rounded bg-bh-paper-soft px-1">.env</code> (next to{" "}
              <code className="rounded bg-bh-paper-soft px-1">app/</code>) to broadcast a real
              <code className="ml-1 rounded bg-bh-paper-soft px-1">register(string)</code> tx.
              Faucet:{" "}
              <a
                href="https://www.alchemy.com/faucets/base-sepolia"
                target="_blank"
                rel="noreferrer"
                className="text-bh-blue-bright hover:underline"
              >
                alchemy.com/faucets/base-sepolia
              </a>
            </p>
          )}
        </div>

        <div className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-5">
          <h3 className="mb-3 text-sm font-medium text-bh-mute">Agent card preview</h3>
          {status ? (
            <>
              <p className="mb-2 text-xs text-bh-mute-2">
                {status.agent_uri_bytes} bytes · stored as{" "}
                <code className="rounded bg-bh-paper-soft px-1">data:application/json;base64,…</code>
              </p>
              <CodeBlock>{JSON.stringify(status.card, null, 2)}</CodeBlock>
            </>
          ) : (
            <p className="text-sm text-bh-mute-2">Loading…</p>
          )}
        </div>
      </section>

      <section className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-5">
        <h3 className="mb-2 text-sm font-medium text-bh-mute">Register TrustGate as ERC-8004 agent</h3>
        <p className="mb-3 text-xs text-bh-mute-2">
          Calls <code className="rounded bg-bh-paper-soft px-1">register(string agentURI)</code> on{" "}
          <code className="break-all font-mono text-bh-blue">{status?.identity_registry || "…"}</code>.
          Endpoints below are stamped into the card before signing — leave both blank to register a
          card with no AXL/HTTP endpoint (you can set them later via{" "}
          <code className="rounded bg-bh-paper-soft px-1">setAgentURI</code>).
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-xs">
            <span className="text-bh-mute">AXL public key (optional)</span>
            <input
              value={axlPubkey}
              onChange={(e) => setAxlPubkey(e.target.value)}
              placeholder="auto-detected from n1 topology when AXL is up"
              className="mt-1 w-full rounded border border-bh-line-strong bg-bh-canvas/40 px-2 py-1.5 font-mono text-[12px] text-bh-ink"
            />
          </label>
          <label className="block text-xs">
            <span className="text-bh-mute">HTTP endpoint (optional)</span>
            <input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="defaults to the API base (override for a public hostname)"
              className="mt-1 w-full rounded border border-bh-line-strong bg-bh-canvas/40 px-2 py-1.5 font-mono text-[12px] text-bh-ink"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={onRegister}
            disabled={registering || registerSubmit.state.kind === "submitting"}
            title={
              isConnected
                ? "Server returns calldata; your wallet signs and broadcasts"
                : signerLive
                  ? "Server signs with the operator PRIVATE_KEY"
                  : "No signer available — preview-only"
            }
            className="rounded bg-bh-blue-bright/25 px-3 py-1.5 text-sm font-medium text-bh-blue ring-1 ring-bh-blue-bright/40 hover:bg-bh-blue-bright/40 disabled:opacity-50"
          >
            {registering || registerSubmit.state.kind === "submitting"
              ? "Submitting…"
              : isConnected
                ? "Sign with wallet"
                : signerLive
                  ? "Sign & broadcast (server)"
                  : "Run dry-run"}
          </button>
          <button
            onClick={() => refresh({ axl_pubkey: axlPubkey || undefined })}
            className="rounded bg-bh-paper-soft/80 px-3 py-1.5 text-sm text-bh-ink-soft ring-1 ring-bh-line-strong hover:bg-bh-paper-soft"
          >
            Refresh card preview
          </button>
          {isConnected && (
            <span className="text-[11px] text-bh-mute-2">
              wallet: <code className="font-mono text-bh-blue">{walletAddress?.slice(0, 6)}…{walletAddress?.slice(-4)}</code>
            </span>
          )}
        </div>
        <WalletSubmitStatus
          state={registerSubmit.state}
          chainId={status?.chain_id ?? 84532}
          followUpLabel="agent_id will appear once the tx confirms — refresh below"
        />
        {registerError && (
          <pre className="mt-3 whitespace-pre-wrap rounded border border-bh-red/40 bg-bh-red/10 p-3 text-xs text-bh-red">
            {registerError}
          </pre>
        )}
        {registerResult && (
          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-bh-mute-2">mode:</span>
              <ModeBadge
                live={registerResult.mode === "live"}
                label={registerResult.mode === "live" ? "broadcast" : "dry-run"}
              />
            </div>
            {registerResult.mode === "live" && registerResult.tx_hash && (
              <p className="text-bh-ink-soft">
                tx:{" "}
                <a
                  href={txUrl({ chain_id: status?.chain_id ?? 84532 }, registerResult.tx_hash)}
                  target="_blank"
                  rel="noreferrer"
                  className="break-all font-mono text-bh-blue hover:underline"
                >
                  {registerResult.tx_hash}
                </a>
                {registerResult.agent_id !== undefined && (
                  <a
                    href={agentUrl(registerResult.agent_id)}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 rounded bg-bh-blue-bright/25 px-2 py-0.5 text-bh-blue ring-1 ring-bh-blue-bright/40 hover:bg-bh-blue-bright/40"
                  >
                    new agent #{registerResult.agent_id}
                  </a>
                )}
              </p>
            )}
            {registerResult.mode === "dry_run" && (
              <>
                <p className="text-bh-mute">
                  to:{" "}
                  <code className="break-all font-mono text-bh-blue">{registerResult.to}</code>
                </p>
                <p className="text-bh-mute">
                  selector: <code className="font-mono text-bh-blue">0xf2c298be</code>{" "}
                  <span className="text-bh-mute-2">(register(string))</span>
                </p>
                <details>
                  <summary className="cursor-pointer text-bh-mute hover:text-bh-ink">
                    show calldata ({registerResult.calldata?.length ?? 0} chars)
                  </summary>
                  <CodeBlock>{registerResult.calldata}</CodeBlock>
                </details>
              </>
            )}
          </div>
        )}
      </section>

      {(status?.owned_agent_ids?.length ?? 0) > 0 && (
        <section className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-5">
          <h3 className="mb-2 text-sm font-medium text-bh-mute">Update existing card · setAgentURI</h3>
          <p className="mb-3 text-xs text-bh-mute-2">
            Re-publishes the card on an agent id you already own. Reputation history is
            preserved (vs. <code className="rounded bg-bh-paper-soft px-1">register</code>, which
            mints a new id). Reverts if the signer isn&apos;t the owner — we pre-flight that
            client-side so you don&apos;t waste gas.
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block text-xs">
              <span className="text-bh-mute">Target agent id</span>
              <select
                value={updateAgentId ?? ""}
                onChange={(e) => setUpdateAgentId(Number(e.target.value))}
                className="mt-1 w-full rounded border border-bh-line-strong bg-bh-canvas/40 px-2 py-1.5 font-mono text-[12px] text-bh-ink"
              >
                {(status?.owned_agent_ids || []).map((id) => (
                  <option key={id} value={id}>
                    #{id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs md:col-span-2">
              <span className="text-bh-mute">
                Card endpoints come from the AXL pubkey + HTTP endpoint above
              </span>
              <p className="mt-1 text-bh-mute-2">
                Edit those fields to change what gets published. The new <code>data:</code> URI
                is built fresh on every click.
              </p>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onUpdateCard("dry-run")}
              disabled={updating || updateAgentId == null}
              className="rounded bg-bh-paper-soft/80 px-3 py-1.5 text-sm text-bh-ink-soft ring-1 ring-bh-line-strong hover:bg-bh-paper-soft disabled:opacity-50"
            >
              {updating ? "Submitting…" : "Preview (dry-run)"}
            </button>
            <button
              onClick={() => onUpdateCard(isConnected ? "wallet" : "server")}
              disabled={
                updating || updateAgentId == null || (!isConnected && !signerLive) ||
                updateSubmit.state.kind === "submitting"
              }
              title={
                isConnected
                  ? "Server returns calldata; your wallet signs and broadcasts"
                  : signerLive
                    ? "Server signs with the operator PRIVATE_KEY"
                    : "Connect a wallet (or set PRIVATE_KEY) to broadcast"
              }
              className="rounded bg-bh-blue-bright/25 px-3 py-1.5 text-sm font-medium text-bh-blue ring-1 ring-bh-blue-bright/40 hover:bg-bh-blue-bright/40 disabled:opacity-50"
            >
              {updating || updateSubmit.state.kind === "submitting"
                ? "Submitting…"
                : isConnected
                  ? "Sign with wallet"
                  : "Sign & broadcast (server)"}
            </button>
          </div>
          <WalletSubmitStatus
            state={updateSubmit.state}
            chainId={status?.chain_id ?? 84532}
            followUpLabel="card update will be visible after the tx confirms"
          />
          {updateError && (
            <pre className="mt-3 whitespace-pre-wrap rounded border border-bh-red/40 bg-bh-red/10 p-3 text-xs text-bh-red">
              {updateError}
            </pre>
          )}
          {updateResult && (
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-bh-mute-2">mode:</span>
                <ModeBadge
                  live={updateResult.mode === "live"}
                  label={
                    updateResult.mode === "live"
                      ? "broadcast"
                      : updateResult.mode === "error"
                        ? "error"
                        : "dry-run"
                  }
                />
                <span className="text-bh-mute-2">agent #{updateResult.agent_id}</span>
              </div>
              {updateResult.mode === "error" && (
                <pre className="whitespace-pre-wrap rounded border border-bh-red/40 bg-bh-red/10 p-3 text-bh-red">
                  {updateResult.error}
                </pre>
              )}
              {updateResult.mode === "live" && updateResult.tx_hash && (
                <p className="text-bh-ink-soft">
                  tx:{" "}
                  <a
                    href={txUrl({ chain_id: status?.chain_id ?? 84532 }, updateResult.tx_hash)}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-mono text-bh-blue hover:underline"
                  >
                    {updateResult.tx_hash}
                  </a>
                  {updateResult.status === 1 && (
                    <span className="ml-2 rounded bg-bh-blue-bright/25 px-2 py-0.5 text-bh-blue ring-1 ring-bh-blue-bright/40">
                      card updated · agent #{updateResult.agent_id}
                    </span>
                  )}
                </p>
              )}
              {updateResult.mode === "dry_run" && (
                <>
                  <p className="text-bh-mute">
                    to:{" "}
                    <code className="break-all font-mono text-bh-blue">{updateResult.to}</code>
                  </p>
                  <details>
                    <summary className="cursor-pointer text-bh-mute hover:text-bh-ink">
                      show calldata ({updateResult.calldata?.length ?? 0} chars)
                    </summary>
                    <CodeBlock>{updateResult.calldata}</CodeBlock>
                  </details>
                </>
              )}
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-bh-line-strong bg-bh-paper/50 p-5">
        <h3 className="mb-2 text-sm font-medium text-bh-mute">ENS resolver</h3>
        <p className="mb-3 text-xs text-bh-mute-2">
          Reverse-resolves an Ethereum address to its primary ENS name (or forward-resolves a
          name to an address). ENS contracts live on Ethereum mainnet, so this hits the
          <code className="ml-1 rounded bg-bh-paper-soft px-1">ENS_RPC_URL</code> endpoint, not the
          Base RPC.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={ensInput}
            onChange={(e) => setEnsInput(e.target.value)}
            placeholder="0x… or name.eth"
            className="flex-1 rounded border border-bh-line-strong bg-bh-canvas/40 px-2 py-1.5 font-mono text-[12px] text-bh-ink"
          />
          <button
            onClick={onResolveEns}
            disabled={ensLoading || !ensInput}
            className="rounded bg-bh-paper-soft/80 px-3 py-1.5 text-sm text-bh-ink-soft ring-1 ring-bh-line-strong hover:bg-bh-paper-soft disabled:opacity-50"
          >
            {ensLoading ? "Resolving…" : "Resolve"}
          </button>
        </div>
        {ensError && (
          <pre className="mt-3 whitespace-pre-wrap rounded border border-bh-red/40 bg-bh-red/10 p-3 text-xs text-bh-red">
            {ensError}
          </pre>
        )}
        {ensResult && (
          <dl className="mt-3 space-y-1 text-xs">
            {ensResult.address && (
              <div className="flex justify-between">
                <dt className="text-bh-mute-2">address</dt>
                <dd className="break-all font-mono text-bh-blue">{ensResult.address}</dd>
              </div>
            )}
            {ensResult.name !== undefined && (
              <div className="flex justify-between">
                <dt className="text-bh-mute-2">primary name</dt>
                <dd className="text-bh-ink">{ensResult.name || "(none)"}</dd>
              </div>
            )}
            {ensResult.forward_address && (
              <div className="flex justify-between">
                <dt className="text-bh-mute-2">forward → address</dt>
                <dd className="break-all font-mono text-bh-blue">{ensResult.forward_address}</dd>
              </div>
            )}
          </dl>
        )}
      </section>
    </div>
  );
}
