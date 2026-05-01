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
};
