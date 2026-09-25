// Provably-fair draw — identical to public.draw_contest() in supabase/schema.sql.
// Works in the browser and in Node (WebCrypto).

export type FairEntry = { ticket: number; nickname: string };

const enc = new TextEncoder();

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

export async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

export function entriesPayload(entries: FairEntry[]): string {
  return [...entries]
    .sort((a, b) => a.ticket - b.ticket)
    .map((e) => `${e.ticket}:${e.nickname}`)
    .join("\n");
}

export async function computeClientSeed(entries: FairEntry[]): Promise<string> {
  return sha256Hex(entriesPayload(entries));
}

export async function computeWinnerIndex(serverSeed: string, code: string, clientSeed: string, count: number): Promise<number | null> {
  if (count <= 0) return null;
  const h = await hmacSha256Hex(serverSeed, `${code}:${clientSeed}`);
  return parseInt(h.slice(0, 13), 16) % count;
}

export type VerifyResult = {
  seedHashOk: boolean;
  clientSeedOk: boolean;
  winnerOk: boolean;
  expectedIndex: number | null;
  expectedNickname: string | null;
  computedClientSeed: string;
  computedSeedHash: string;
};

export async function verifyContest(input: {
  code: string;
  serverSeed: string;
  serverSeedHash: string;
  clientSeed: string | null;
  winnerIndex: number | null;
  winnerNickname: string | null;
  entries: FairEntry[];
}): Promise<VerifyResult> {
  const computedSeedHash = await sha256Hex(input.serverSeed);
  const computedClientSeed = await computeClientSeed(input.entries);
  const sorted = [...input.entries].sort((a, b) => a.ticket - b.ticket);
  const expectedIndex = await computeWinnerIndex(input.serverSeed, input.code, computedClientSeed, sorted.length);
  const expectedNickname = expectedIndex === null ? null : sorted[expectedIndex]?.nickname ?? null;
  return {
    seedHashOk: computedSeedHash === input.serverSeedHash,
    clientSeedOk: computedClientSeed === input.clientSeed,
    winnerOk: expectedIndex === input.winnerIndex && expectedNickname === input.winnerNickname,
    expectedIndex,
    expectedNickname,
    computedClientSeed,
    computedSeedHash,
  };
}
