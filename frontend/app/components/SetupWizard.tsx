"use client";

import { useEffect, useState } from "react";
import { api, type SetupStatus } from "@/lib/api";

type StepState = "ok" | "warn" | "missing" | "loading";

const TICK = "✓";
const DASH = "—";
const CROSS = "✗";

function StatusGlyph({ s }: { s: StepState }) {
  const cls =
    s === "ok"
      ? "text-emerald-400"
      : s === "warn"
        ? "text-amber-400"
        : s === "missing"
          ? "text-rose-400"
          : "text-zinc-500";
  const ch = s === "ok" ? TICK : s === "missing" ? CROSS : s === "warn" ? "!" : DASH;
  return <span className={`mr-2 inline-block w-3 text-center font-mono ${cls}`}>{ch}</span>;
}

function Step({
  state,
  title,
  children,
}: {
  state: StepState;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex gap-2">
      <StatusGlyph s={state} />
      <div className="min-w-0 flex-1">
        <div className="text-zinc-200">{title}</div>
        {children && <div className="mt-0.5 text-[11px] text-zinc-500">{children}</div>}
      </div>
    </li>
  );
}

function deriveSteps(s: SetupStatus | null): {
  envFile: StepState;
  signer: StepState;
  funded: StepState;
  keeperKey: StepState;
  keeperMcp: StepState;
  allCoreOk: boolean;
  allOk: boolean;
} {
  if (!s) {
    return {
      envFile: "loading",
      signer: "loading",
      funded: "loading",
      keeperKey: "loading",
      keeperMcp: "loading",
      allCoreOk: false,
      allOk: false,
    };
  }
  // Step 1 (.env file present) is implicit: any of the env-driven knobs being
  // non-default counts as ".env loaded". Treat as warn if NONE of them is set.
  const anyConfigured = s.signer.configured || s.keeperhub.api_key_configured;
  const envFile: StepState = anyConfigured ? "ok" : "warn";

  const signer: StepState = !s.signer.configured
    ? "missing"
    : s.signer.valid
      ? "ok"
      : "missing";

  const funded: StepState =
    !s.signer.valid
      ? "loading"
      : (s.signer.balance_eth ?? 0) >= 0.0005
        ? "ok"
        : (s.signer.balance_eth ?? 0) > 0
          ? "warn"
          : "missing";

  const keeperKey: StepState = s.keeperhub.api_key_configured ? "ok" : "warn";
  const keeperMcp: StepState = !s.keeperhub.api_key_configured
    ? "warn"
    : s.keeperhub.api_reachable
      ? "ok"
      : "missing";

  return {
    envFile,
    signer,
    funded,
    keeperKey,
    keeperMcp,
    allCoreOk: signer === "ok" && (funded === "ok" || funded === "warn"),
    allOk: keeperKey === "ok" && keeperMcp === "ok",
  };
}

export function SetupWizard() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [verifying, setVerifying] = useState(false);

  async function load() {
    setVerifying(true);
    setErr(null);
    try {
      const s = await api.setupStatus();
      setStatus(s);
    } catch (e) {
      setErr((e as Error).message || String(e));
    } finally {
      setVerifying(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const steps = deriveSteps(status);
  const everythingOk = steps.allCoreOk && steps.allOk;

  // Auto-collapse once everything is green so power users aren't nagged.
  useEffect(() => {
    if (everythingOk) setCollapsed(true);
  }, [everythingOk]);

  const summary = !status
    ? "Loading…"
    : everythingOk
      ? "All set — full live mode (sign txs, settle, write feedback)."
      : steps.allCoreOk
        ? "Core demo ready. KeeperHub live mode optional."
        : "Demo runs in stub / dry-run mode. Set PRIVATE_KEY to enable on-chain writes.";

  return (
    <section
      className={
        "rounded-lg border p-5 " +
        (everythingOk
          ? "border-emerald-500/30 bg-emerald-500/5"
          : steps.allCoreOk
            ? "border-amber-500/30 bg-amber-500/5"
            : "border-rose-500/30 bg-rose-500/5")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">
            <span className="text-zinc-200">Setup status</span>
            <span className="ml-2 text-[11px] uppercase tracking-wider text-zinc-500">
              {everythingOk ? "live" : steps.allCoreOk ? "core" : "stub-only"}
            </span>
          </h3>
          <p className="mt-1 text-xs text-zinc-400">{summary}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={load}
            disabled={verifying}
            className="rounded bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-800 disabled:opacity-50"
          >
            {verifying ? "Verifying…" : "Verify"}
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded bg-zinc-800/60 px-3 py-1.5 text-xs text-zinc-400 ring-1 ring-zinc-700 hover:text-zinc-200"
          >
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </div>

      {err && (
        <pre className="mt-3 whitespace-pre-wrap rounded border border-rose-900 bg-rose-950/40 p-3 text-xs text-rose-200">
          {err}
        </pre>
      )}

      {!collapsed && (
        <ol className="mt-4 space-y-2 text-sm">
          <Step state={steps.envFile} title="`.env` file is loaded">
            {status && status.signer.configured ? (
              <>configuration loaded — `.env` next to the repo root is being read</>
            ) : (
              <>
                copy{" "}
                <code className="rounded bg-zinc-800 px-1">.env.example</code>
                {" "}to{" "}
                <code className="rounded bg-zinc-800 px-1">.env</code>
                {" "}(at the repo root) and restart the API
              </>
            )}
          </Step>

          <Step
            state={steps.signer}
            title={
              status?.signer.address
                ? `Signer ${status.signer.address.slice(0, 6)}…${status.signer.address.slice(-4)} loaded`
                : "Add a Sepolia-funded private key"
            }
          >
            {!status?.signer.configured ? (
              <>
                add{" "}
                <code className="rounded bg-zinc-800 px-1">PRIVATE_KEY=0x…</code>
                {" "}to{" "}
                <code className="rounded bg-zinc-800 px-1">.env</code>
                {" "}— never reuse a mainnet key
              </>
            ) : status?.signer.error ? (
              <span className="text-rose-300">{status.signer.error}</span>
            ) : (
              <>chain id {status.chain_id} ({status.network})</>
            )}
          </Step>

          <Step
            state={steps.funded}
            title={
              status?.signer.balance_eth != null
                ? `Signer balance: ${status.signer.balance_eth.toFixed(5)} ETH`
                : "Fund signer with Sepolia ETH"
            }
          >
            {steps.funded === "missing" ? (
              <>
                top up at{" "}
                <a
                  href="https://www.alchemy.com/faucets/base-sepolia"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline"
                >
                  alchemy.com/faucets/base-sepolia
                </a>{" "}
                — 0.005 ETH covers ~50 register / feedback writes
              </>
            ) : steps.funded === "warn" ? (
              <span className="text-amber-300">
                {status?.signer.balance_warning || "balance is low — consider topping up"}
              </span>
            ) : steps.funded === "ok" ? (
              <>plenty of headroom for register / feedback writes</>
            ) : (
              <>—</>
            )}
          </Step>

          <Step
            state={steps.keeperKey}
            title={status?.keeperhub.api_key_configured ? "KeeperHub API key loaded" : "(optional) Add a KeeperHub API key"}
          >
            {!status?.keeperhub.api_key_configured ? (
              <>
                add <code className="rounded bg-zinc-800 px-1">KEEPERHUB_API_KEY=…</code>{" "}
                to enable live settlement. Stub mode renders a fully-instrumented
                audit trail without a key.
              </>
            ) : (
              <>
                live mode targets <code className="rounded bg-zinc-800 px-1">{status.keeperhub.network}</code>{" "}
                / <code className="rounded bg-zinc-800 px-1">{status.keeperhub.token}</code>
              </>
            )}
          </Step>

          <Step
            state={steps.keeperMcp}
            title={
              status?.keeperhub.api_reachable
                ? "KeeperHub REST API reachable"
                : status?.keeperhub.api_key_configured
                  ? "Reach KeeperHub's REST API"
                  : "(skipped — no API key)"
            }
          >
            {!status?.keeperhub.api_key_configured ? (
              <>—</>
            ) : status?.keeperhub.api_reachable ? (
              <>
                <code className="rounded bg-zinc-800 px-1">{status.keeperhub.api_url}</code> responded
              </>
            ) : (
              <>
                <code className="rounded bg-zinc-800 px-1">{status.keeperhub.api_url}</code>
                {" "}isn't reachable. The backend uses{" "}
                <code className="rounded bg-zinc-800 px-1">/api/execute/transfer</code> — see{" "}
                <a
                  href="https://docs.keeperhub.com/api/direct-execution"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline"
                >
                  docs.keeperhub.com/api/direct-execution
                </a>
                . Override the host with{" "}
                <code className="rounded bg-zinc-800 px-1">KEEPERHUB_API_URL</code> in{" "}
                <code className="rounded bg-zinc-800 px-1">.env</code> if needed.
                {status?.keeperhub.api_error && (
                  <span className="block mt-1 text-rose-300">{status.keeperhub.api_error}</span>
                )}
              </>
            )}
          </Step>
        </ol>
      )}

      {!collapsed && status && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <ReadyPill on={status.ready.stub_demo} label="Stub demo" hint="Run a sample hire (no wallet, no gas)" />
          <ReadyPill on={status.ready.core} label="Core live" hint="register, giveFeedback work onchain" />
          <ReadyPill on={status.ready.keeperhub_live} label="KeeperHub live" hint="settle_payment broadcasts via REST API" />
        </div>
      )}
    </section>
  );
}

function ReadyPill({ on, label, hint }: { on: boolean; label: string; hint: string }) {
  return (
    <div
      className={
        "rounded border px-3 py-2 text-xs " +
        (on
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
          : "border-zinc-700 bg-zinc-900/40 text-zinc-500")
      }
    >
      <div className="font-medium">
        {on ? TICK : DASH} {label}
      </div>
      <div className="mt-0.5 text-[10px] opacity-80">{hint}</div>
    </div>
  );
}
