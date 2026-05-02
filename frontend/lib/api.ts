// Typed client for the TrustGate Flask API.
//
// All fetches are client-side; the dashboard is read-only / interactive.
// API_BASE is overridable at build time with NEXT_PUBLIC_API_URL.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://127.0.0.1:8000";

export type Endpoint = {
  name?: string;
  endpoint?: string;
  version?: string;
  skills?: string[];
  domains?: string[];
  capabilities?: string[];
  [k: string]: unknown;
};

export type AgentCard = {
  type?: string;
  name?: string;
  description?: string;
  image?: string;
  active?: boolean;
  endpoints?: Endpoint[];
  [k: string]: unknown;
};

export type Agent = {
  agent_id: number;
  name: string | null;
  owner: string;
  owner_ens?: string | null;
  agent_uri: string;
  block: number;
  tx_hash: string;
  active: boolean | null;
  capabilities: string[];
  endpoints: Endpoint[];
  card: AgentCard | null;
  card_load_error: string | null;
};

export type Reputation = {
  agent_id: number;
  clients: string[];
  count: number;
  average_raw: number;
  score: number;
  trust_level: number;
};

export type FeedbackRow = {
  client: string;
  index: number;
  score_raw: number;
  score: number;
  trust_level: number;
  tag: string;
  tag2: string;
  revoked: boolean;
};

export type ScoredCandidate = {
  agent_id: number;
  name: string | null;
  reputation: number;
  price: number;
  latency_hint: number;
  feedback_count: number;
  trust_level: number;
  score: number;
  breakdown: {
    reputation: number;
    price_score: number;
    latency_score: number;
    w_reputation: number;
    w_price: number;
    w_latency: number;
  };
  extras: Record<string, unknown>;
};

export type FindBestResult = {
  capability: string;
  budget: number;
  min_reputation: number;
  elapsed_seconds: number;
  explanation: string;
  candidates: ScoredCandidate[];
};

export type CacheStatus = {
  deploy_block: number | null;
  last_scanned_block: number | null;
  head_block: number;
  blocks_behind: number | null;
  agents_in_cache: number;
  cards_in_cache: number;
  cache_path: string;
};

export type NetworkInfo = {
  network: string;
  rpc_url: string;
  chain_id: number;
  head_block: number;
  identity_registry: string;
  reputation_registry: string;
};

export type AxlTopology = {
  api_port: number;
  topology?: {
    our_ipv6: string;
    our_public_key: string;
    peers: { uri: string; up: boolean; inbound: boolean }[];
    tree: unknown[];
  };
  error?: string;
};

export type AxlSendJobResult = {
  ok: boolean;
  job_id: string;
  sent_bytes: number;
  job_spec: { task: string; input: string; budget: number; deadline: number };
  reply_from?: string;
  reply?: { status: string; result: string; job_id: string };
  a_pubkey: string;
  b_pubkey: string;
  error?: string;
};

export type SyntheticCandidate = {
  agent_id: number;
  name: string;
  axl_pubkey: string;
  endpoints: { name: string; endpoint: string }[];
  reputation?: number;
  feedback_count?: number;
  trust_level?: number;
  price?: number;
  latency_hint?: number;
};

export type HireAttempt = {
  candidate: Record<string, unknown>;
  ok: boolean;
  reply: Record<string, unknown> | null;
  error: string | null;
  elapsed_seconds: number;
};

export type HireResult = {
  capability: string;
  service: string;
  inner_request: Record<string, unknown>;
  candidates: Record<string, unknown>[];
  attempts: HireAttempt[];
  winner_index: number | null;
  final_reply: Record<string, unknown> | null;
};

export type AxlAgentCard = {
  api_port: number;
  peer: string;
  card: Record<string, unknown>;
};

export type AxlA2AResult = {
  ok: boolean;
  peer?: string;
  service?: string;
  reply?: Record<string, unknown>;
  error?: string;
};

export type SettlementStatus = {
  keeperhub: {
    api_key_configured: boolean;
    mode: "live" | "stub";
    network: string;
    token: string;
  };
  feedback_signer: {
    private_key_configured: boolean;
    mode: "live" | "dry_run";
    chain_id: number;
    address?: string;
    balance_wei?: number;
    balance_eth?: number;
    error?: string;
  };
};

export type SettlementResult = {
  mode: "stub" | "live-mcp" | "live-api";
  workflow_id: string;
  status: "executed" | "pending" | "failed";
  agent_wallet: string;
  amount: number;
  token: string;
  network: string;
  tx_hash?: string;
  audit_log: { ts: number; step: string; ok: boolean }[];
  error?: string | null;
  elapsed_seconds: number;
};

export type FeedbackResult = {
  mode: "dry_run" | "live" | "error" | "skipped";
  agent_id: number;
  score: number;
  score_raw: number;
  tags: { tag1: string; tag2: string };
  tx_hash?: string | null;
  block_number?: number | null;
  status?: number | null;
  gas_used?: number | null;
  receipt_error?: string | null;
  tx?: Record<string, unknown> | null;
  calldata?: string | null;
  elapsed_seconds: number;
  error?: string | null;
};

export type SetupStatus = {
  network: string;
  chain_id: number;
  signer: {
    configured: boolean;
    valid: boolean;
    address: string | null;
    balance_eth: number | null;
    balance_warning: string | null;
    error: string | null;
  };
  ens: {
    ok: boolean;
    rpc_url?: string;
    error?: string;
    rpcs?: { url: string; ok: boolean; error?: string; chain_id?: number; head_block?: number }[];
    cache_ttl_s?: number;
  };
  keeperhub: {
    api_key_configured: boolean;
    mode: "live" | "stub";
    network: string;
    token: string;
    mcp_url: string;
    mcp_reachable: boolean;
    mcp_error: string | null;
  };
  cache: {
    agents_in_cache: number;
    head_block: number;
    last_scanned_block: number | null;
    blocks_behind: number | null;
  };
  ready: {
    core: boolean;
    keeperhub_live: boolean;
    stub_demo: boolean;
  };
};

export type SelfStatus = {
  network: string;
  identity_registry: string;
  chain_id: number;
  signer: {
    private_key_configured: boolean;
    address?: string;
    balance_wei?: number;
    balance_eth?: number;
    ens_name?: string | null;
    error?: string;
  };
  owned_agent_ids: number[];
  card: AgentCard;
  agent_uri: string;
  agent_uri_bytes: number;
};

export type SelfRegisterResult = {
  mode: "dry_run" | "live";
  agent_uri: string;
  card?: AgentCard;
  // dry-run
  to?: string;
  calldata?: string;
  tx?: Record<string, unknown>;
  note?: string;
  // live
  from?: string;
  tx_hash?: string;
  agent_id?: number;
  block_number?: number;
  status?: number;
  gas_used?: number;
  receipt_error?: string;
};

export type EnsResolveResult = {
  rpc_url: string;
  address?: string;
  name?: string | null;
  forward_address?: string | null;
};

export type CompleteHireResult = {
  hire: HireResult;
  settlement: SettlementResult | null;
  feedback: FeedbackResult | { mode: "skipped"; reason: string } | null;
  overall_status: "ok" | "delivery_failed" | "settlement_failed" | "feedback_failed" | "unknown";
  error?: string | null;
};

async function jget<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {}
    throw new Error(`${res.status} ${res.statusText} from ${path}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

export const api = {
  health: () => jget<{ ok: boolean; rpc: string; chain_id: number; head_block: number }>("/api/health"),
  network: () => jget<NetworkInfo>("/api/network"),
  cacheStatus: () => jget<CacheStatus>("/api/cache-status"),
  agents: (params: { capability?: string; limit?: number; offset?: number; active?: boolean } = {}) => {
    const q = new URLSearchParams();
    if (params.capability) q.set("capability", params.capability);
    if (params.limit !== undefined) q.set("limit", String(params.limit));
    if (params.offset !== undefined) q.set("offset", String(params.offset));
    if (params.active === false) q.set("active", "0");
    const qs = q.toString();
    return jget<{ total_returned: number; offset: number; limit: number; agents: Agent[] }>(
      `/api/agents${qs ? `?${qs}` : ""}`
    );
  },
  agent: (id: number) =>
    jget<{
      agent_id: number;
      owner: string;
      owner_ens?: string | null;
      agent_uri: string;
      live_token_uri: string | null;
      block: number;
      tx_hash: string;
      card: AgentCard | null;
      card_error: string | null;
      reputation: Reputation;
    }>(`/api/agents/${id}`),
  reputation: (id: number) => jget<Reputation>(`/api/agents/${id}/reputation`),
  feedback: (id: number, limit = 20) =>
    jget<{ agent_id: number; rows: FeedbackRow[] }>(`/api/agents/${id}/feedback?limit=${limit}`),
  findBest: (body: {
    capability: string;
    budget?: number;
    min_reputation?: number;
    require_feedback?: boolean;
    limit?: number;
    default_price?: number;
    default_latency?: number;
  }) =>
    jget<FindBestResult>("/api/find-best-agent", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  axlTopology: (apiPort: number) => jget<AxlTopology>(`/api/axl/topology?api_port=${apiPort}`),
  axlSendJob: (body: { a_port?: number; b_port?: number; task?: string; input: string; timeout?: number }) =>
    jget<AxlSendJobResult>("/api/axl/send-job", { method: "POST", body: JSON.stringify(body) }),
  axlAgentCard: (peer: string, apiPort = 9002) =>
    jget<AxlAgentCard>(`/api/axl/agent-card?peer=${peer}&api_port=${apiPort}`),
  axlA2A: (body: {
    peer: string;
    service?: string;
    input?: string;
    inner_request?: Record<string, unknown>;
    api_port?: number;
    timeout?: number;
  }) =>
    jget<AxlA2AResult>("/api/axl/a2a", { method: "POST", body: JSON.stringify(body) }),
  hire: (body: {
    capability?: string;
    service?: string;
    input?: string;
    inner_request?: Record<string, unknown>;
    candidates?: Record<string, unknown>[];
    extra_candidates?: SyntheticCandidate[];
    a2a_timeout?: number;
    max_attempts?: number;
    budget?: number;
    min_reputation?: number;
    require_feedback?: boolean;
    limit?: number;
    api_port?: number;
  }) => jget<HireResult>("/api/hire", { method: "POST", body: JSON.stringify(body) }),

  // Phase 5
  settlementStatus: () => jget<SettlementStatus>("/api/settlement/status"),
  settle: (body: { agent_wallet: string; amount_usdc?: number; force_stub?: boolean }) =>
    jget<SettlementResult>("/api/settle", { method: "POST", body: JSON.stringify(body) }),
  writeFeedback: (body: {
    agent_id: number;
    score?: number;
    tags?: string[];
    endpoint?: string;
    feedback_uri?: string;
    feedback_payload?: Record<string, unknown>;
  }) => jget<FeedbackResult>("/api/write-feedback", { method: "POST", body: JSON.stringify(body) }),
  // Phase 9
  setupStatus: () => jget<SetupStatus>("/api/setup/status"),
  capabilities: () =>
    jget<{ total: number; capabilities: { capability: string; count: number }[] }>(
      "/api/capabilities"
    ),

  // Phase 6
  selfStatus: (params: { axl_pubkey?: string } = {}) => {
    const q = new URLSearchParams();
    if (params.axl_pubkey) q.set("axl_pubkey", params.axl_pubkey);
    const qs = q.toString();
    return jget<SelfStatus>(`/api/self/status${qs ? `?${qs}` : ""}`);
  },
  selfRegister: (body: {
    axl_pubkey?: string;
    api_url?: string;
    ens_name?: string;
    private_key?: string;
    wait_for_receipt?: boolean;
  }) => jget<SelfRegisterResult>("/api/self/register", { method: "POST", body: JSON.stringify(body) }),
  ensResolve: (params: { address?: string; name?: string }) => {
    const q = new URLSearchParams();
    if (params.address) q.set("address", params.address);
    if (params.name) q.set("name", params.name);
    return jget<EnsResolveResult>(`/api/ens/resolve?${q.toString()}`);
  },

  completeHire: (body: {
    capability?: string;
    service?: string;
    input?: string;
    inner_request?: Record<string, unknown>;
    candidates?: Record<string, unknown>[];
    extra_candidates?: SyntheticCandidate[];
    a2a_timeout?: number;
    max_attempts?: number;
    payment_amount_usdc?: number;
    feedback_score?: number;
    feedback_tags?: string[];
    feedback_endpoint?: string;
    write_feedback_onchain?: boolean;
    force_stub_settlement?: boolean;
    api_port?: number;
  }) =>
    jget<CompleteHireResult>("/api/complete-hire", { method: "POST", body: JSON.stringify(body) }),
};
