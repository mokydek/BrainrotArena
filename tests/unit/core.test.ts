import { test } from "node:test";
import assert from "node:assert/strict";
import { isReservedNickname, validateNickname } from "../../src/lib/nickname.ts";
import { sortStreamers, effectiveLive, isVisible, type Streamer } from "../../src/lib/types.ts";
import { computeClientSeed, computeWinnerIndex, sha256Hex, verifyContest } from "../../src/lib/fair.ts";

test("nickname validation", () => {
  assert.equal(validateNickname("ab"), "NICK_TOO_SHORT");
  assert.equal(validateNickname("  abc  "), null);
  assert.equal(validateNickname("a".repeat(17)), "NICK_TOO_LONG");
  assert.equal(validateNickname("Мистер_Бист"), null);
  assert.equal(validateNickname("bad name"), "NICK_BAD_CHARS");
  assert.equal(validateNickname("<script>"), "NICK_BAD_CHARS");
  assert.equal(validateNickname("skibidi.toilet-1"), null);
  assert.equal(isReservedNickname("Admin"), true);
  assert.equal(isReservedNickname("ad_min"), true);
  assert.equal(isReservedNickname("admiral"), false);
});

function s(p: Partial<Streamer> & { id: string }): Streamer {
  return {
    side: "left",
    platform: "tiktok",
    handle: p.id,
    profile_url: "",
    display_name: null,
    avatar_url: null,
    verified: false,
    followers: null,
    is_live: false,
    live_url: null,
    viewers: null,
    live_started_at: null,
    manual_live: null,
    live_checked_at: null,
    profile_checked_at: null,
    fetch_error: null,
    sort_order: 0,
    paid_until: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...p,
  };
}

test("live streamers go first, then admin order", () => {
  const list = [
    s({ id: "a", sort_order: 0 }),
    s({ id: "b", sort_order: 1, is_live: true }),
    s({ id: "c", sort_order: 2 }),
    s({ id: "d", sort_order: 3, manual_live: true }),
    s({ id: "e", sort_order: 4, is_live: true, manual_live: false }),
  ];
  assert.deepEqual(sortStreamers(list).map((x) => x.id), ["b", "d", "a", "c", "e"]);
  assert.equal(effectiveLive(list[4]), false);
  assert.equal(effectiveLive(list[3]), true);
  assert.equal(isVisible({ paid_until: null }), true);
  assert.equal(isVisible({ paid_until: "2000-01-01T00:00:00Z" }), false);
});

test("fair draw is deterministic and verifiable", async () => {
  const entries = [
    { ticket: 1, nickname: "Бета" },
    { ticket: 0, nickname: "Alpha" },
    { ticket: 2, nickname: "gamma" },
  ];
  const seed = "a".repeat(64);
  const cs = await computeClientSeed(entries);
  assert.equal(cs, await sha256Hex("0:Alpha\n1:Бета\n2:gamma"));
  const idx = await computeWinnerIndex(seed, "CODE123", cs, 3);
  assert.ok(idx !== null && idx >= 0 && idx < 3);
  const sorted = [...entries].sort((a, b) => a.ticket - b.ticket);
  const r = await verifyContest({
    code: "CODE123",
    serverSeed: seed,
    serverSeedHash: await sha256Hex(seed),
    clientSeed: cs,
    winnerIndex: idx,
    winnerNickname: sorted[idx!].nickname,
    entries,
  });
  assert.ok(r.seedHashOk && r.clientSeedOk && r.winnerOk);
  const tampered = await verifyContest({ ...{ code: "CODE123", serverSeed: seed, serverSeedHash: await sha256Hex(seed), clientSeed: cs, winnerIndex: idx, winnerNickname: "someone else" }, entries });
  assert.equal(tampered.winnerOk, false);
  assert.equal(await computeWinnerIndex(seed, "X", cs, 0), null);
});
