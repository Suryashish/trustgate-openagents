// External-explorer deeplink helpers.
//
// Switches between Sepolia and Mainnet based on the active network info we
// already fetch from /api/network. Every URL is opened in a new tab from the
// dashboard — none of these are followed server-side, so we don't need to
// worry about open-redirect issues.

const BASESCAN = {
  84532: "https://sepolia.basescan.org",
  8453: "https://basescan.org",
} as const;

const SCAN_8004 = "https://8004scan.app";

export type NetLike = { chain_id?: number | null } | null | undefined;

function basescanRoot(net: NetLike): string {
  const id = net?.chain_id ?? 84532;
  return BASESCAN[id as keyof typeof BASESCAN] ?? BASESCAN[84532];
}

/** External link to a transaction page on Basescan (Sepolia or mainnet). */
export function txUrl(net: NetLike, hash: string): string {
  const h = hash.startsWith("0x") ? hash : `0x${hash}`;
  return `${basescanRoot(net)}/tx/${h}`;
}

/** External link to an address page (used for owner / wallet / contract addresses). */
export function addressUrl(net: NetLike, address: string): string {
  return `${basescanRoot(net)}/address/${address}`;
}

/** External link to an ERC-721 token page on Basescan (registry contract + tokenId). */
export function tokenUrl(net: NetLike, contract: string, tokenId: number | string): string {
  return `${basescanRoot(net)}/token/${contract}?a=${tokenId}`;
}

/** External link to 8004scan.app for a registered agent — works on both networks. */
export function agentUrl(agentId: number | string): string {
  return `${SCAN_8004}/agent/${agentId}`;
}

/** Pretty-truncated 0x-address: "0xd8dA…6045". Use when full hash would overflow the row. */
export function shortAddress(addr: string | null | undefined): string {
  if (!addr) return "";
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Pretty-truncated tx hash: "0xee342159…26e4c604". */
export function shortTx(hash: string | null | undefined): string {
  if (!hash) return "";
  const h = hash.startsWith("0x") ? hash : `0x${hash}`;
  if (h.length <= 18) return h;
  return `${h.slice(0, 10)}…${h.slice(-8)}`;
}
