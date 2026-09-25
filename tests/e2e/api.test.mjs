// API integration tests against a running app (npm start) + local Supabase stack.
// Run: node --test tests/e2e/api.test.mjs   (env from tests/local/env.sh)
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DB = process.env.POSTGRES_URL_NON_POOLING;

class Client {
  jar = new Map();
  async req(path, { method, body, form } = {}) {
    const headers = {};
    if (this.jar.size) headers.cookie = [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (body) headers["content-type"] = "application/json";
    const res = await fetch(BASE + path, { method: method || (body || form ? "POST" : "GET"), headers, body: form || (body ? JSON.stringify(body) : undefined) });
    for (const c of res.headers.getSetCookie?.() || []) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      const k = kv.slice(0, i), v = kv.slice(i + 1);
      if (v) this.jar.set(k, v); else this.jar.delete(k);
    }
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  }
}

async function anon(path, opts = {}) {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    method: opts.method || "GET",
    headers: { apikey: ANON, authorization: `Bearer ${ANON}`, "content-type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const sql = (q) => execSync(`psql "${DB}" -At -c ${JSON.stringify(q)}`, { encoding: "utf8" }).trim();
const setLive = (m) => fs.writeFileSync("/tmp/ba-live.json", JSON.stringify(m));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const admin = new Client();
const p1 = new Client(), p2 = new Client(), p3 = new Client(), p4 = new Client(), guest = new Client();
const state = {};

test("health", async () => {
  const r = await guest.req("/api/health");
  assert.equal(r.data.dbReady, true);
});

test("nicknames are unique (case-insensitive) and validated", async () => {
  let r = await p1.req("/api/player", { body: { nickname: "Alpha" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.player.nickname, "Alpha");
  assert.ok(p1.jar.get("ba_player"));

  r = await p2.req("/api/player", { body: { nickname: "alpha" } });
  assert.equal(r.status, 409);
  assert.equal(r.data.error, "NICK_TAKEN");
  r = await p2.req("/api/player", { body: { nickname: "  ALPHA " } });
  assert.equal(r.data.error, "NICK_TAKEN");
  r = await p2.req("/api/player", { body: { nickname: "ab" } });
  assert.equal(r.data.error, "NICK_TOO_SHORT");
  r = await p2.req("/api/player", { body: { nickname: "Admin" } });
  assert.equal(r.data.error, "NICK_RESERVED");
  r = await p2.req("/api/player", { body: { nickname: "bad nick" } });
  assert.equal(r.data.error, "NICK_BAD_CHARS");

  r = await p2.req("/api/player/check?nickname=ALPHA");
  assert.equal(r.data.available, false);
  r = await p1.req("/api/player/check?nickname=alpha");
  assert.equal(r.data.available, true, "own nickname is available to owner");
  assert.equal(r.data.mine, true);

  // persistence: same cookie -> same player
  r = await p1.req("/api/player");
  assert.equal(r.data.player.nickname, "Alpha");

  // rename frees the old nickname
  r = await p1.req("/api/player", { body: { nickname: "AlphaKing" } });
  assert.equal(r.data.player.nickname, "AlphaKing");
  r = await p2.req("/api/player", { body: { nickname: "Alpha" } });
  assert.equal(r.status, 200);
  r = await p3.req("/api/player", { body: { nickname: "Бетон_3" } });
  assert.equal(r.status, 200);
  r = await p4.req("/api/player", { body: { nickname: "gamma.x" } });
  assert.equal(r.status, 200);
  // renaming to someone else's nick is refused
  r = await p1.req("/api/player", { body: { nickname: "бетон_3" } });
  assert.equal(r.data.error, "NICK_TAKEN");
  assert.equal(sql("select count(*) from players"), "4");
});

test("admin endpoints are protected", async () => {
  for (const [path, opts] of [
    ["/api/streamers", { body: { url: "@x" } }],
    ["/api/streamers/preview", { body: { url: "@x" } }],
    ["/api/contest", { body: { durationSeconds: 60 } }],
    ["/api/upload", { form: new FormData() }],
    ["/api/admin/setup", { method: "POST" }],
    ["/api/streamers/reorder", { body: { ids: ["x"] } }],
  ]) {
    const r = await p1.req(path, opts);
    assert.equal(r.status, 401, path);
    assert.equal(r.data.error, "NOT_ADMIN");
  }
  let r = await admin.req("/api/admin/login", { body: { password: "nope" } });
  assert.equal(r.status, 401);
  r = await admin.req("/api/admin/login", { body: { password: "test-admin-pass" } });
  assert.equal(r.status, 200);
  assert.ok(admin.jar.get("ba_admin"));
  // forged cookie
  const forged = new Client();
  forged.jar.set("ba_admin", "admin.9999999999.AAAA");
  r = await forged.req("/api/contest", { body: { durationSeconds: 60 } });
  assert.equal(r.status, 401);
});

test("admin setup endpoint runs the schema (idempotent)", async () => {
  const r = await admin.req("/api/admin/setup", { method: "POST" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
});

test("add streamers from social links (auto data + avatar mirroring)", async () => {
  setLive({});
  let r = await admin.req("/api/streamers/preview", { body: { url: "https://www.tiktok.com/@kazuhiko_mayuko?lang=en" } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const prof = r.data.profile;
  assert.equal(prof.displayName, "KAZ");
  assert.equal(prof.verified, true);
  assert.equal(prof.followers, 1523000);
  assert.equal(prof.isLive, false);
  assert.equal(prof.error, null);

  r = await admin.req("/api/streamers", { body: { url: "https://www.tiktok.com/@kazuhiko_mayuko", side: "left", profile: prof } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const kaz = r.data.streamer;
  state.kaz = kaz;
  assert.equal(kaz.side, "left");
  assert.match(kaz.avatar_url, /\/storage\/v1\/object\/public\/media\/avatars\/.+\.png\?v=\d+/);
  const img = await fetch(kaz.avatar_url);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/png");

  r = await admin.req("/api/streamers", { body: { url: "@kazuhiko_mayuko", side: "right" } });
  assert.equal(r.status, 409);
  assert.equal(r.data.error, "DUPLICATE_STREAMER");

  // without preview (server fetches itself)
  r = await admin.req("/api/streamers", { body: { url: "tiktok.com/@rickystarsab", side: "right" } });
  assert.equal(r.status, 200);
  state.ricky = r.data.streamer;
  assert.equal(state.ricky.display_name, "RICKYSTARSAB");

  // profile page blocked -> live api fallback still gives name + avatar
  r = await admin.req("/api/streamers/preview", { body: { url: "https://www.tiktok.com/@deets_gaming" } });
  assert.equal(r.data.profile.displayName, "DEETS GAMING");
  assert.equal(r.data.profile.error, null);
  assert.match(r.data.profile.avatarUrl, /deets_gaming~thumb/);
  r = await admin.req("/api/streamers", { body: { url: "https://www.tiktok.com/@deets_gaming", side: "left", profile: r.data.profile } });
  state.deets = r.data.streamer;
  assert.match(state.deets.avatar_url, /storage\/v1\/object\/public/);

  // totally unreachable -> manual data
  r = await admin.req("/api/streamers/preview", { body: { url: "https://www.tiktok.com/@unknown_person" } });
  assert.equal(r.data.profile.error, "TIKTOK_UNREACHABLE");
  r = await admin.req("/api/streamers", {
    body: { url: "https://www.tiktok.com/@unknown_person", side: "right", profile: r.data.profile, displayName: "Manual Name", avatarUrl: "", manualLive: true },
  });
  assert.equal(r.status, 200);
  state.manual = r.data.streamer;
  assert.equal(state.manual.display_name, "Manual Name");
  assert.equal(state.manual.manual_live, true);

  // short link
  r = await admin.req("/api/streamers/preview", { body: { url: "https://vm.tiktok.com/ZMabc/" } });
  assert.equal(r.data.profile.handle, "gojobtww");

  r = await admin.req("/api/streamers/preview", { body: { url: "hello world" } });
  assert.equal(r.data.error, "BAD_LINK");

  const pub = await anon("streamers?select=id,display_name,side");
  assert.equal(pub.data.length, 4);
});

test("live refresher: throttled, detects live + viewers", async () => {
  setLive({ rickystarsab: 777 });
  let r = await guest.req("/api/streamers/refresh", { method: "POST" });
  assert.equal(r.data.checked, 0, "fresh rows are not re-checked (throttle)");
  sql("update streamers set live_checked_at = now() - interval '2 minutes'");
  r = await guest.req("/api/streamers/refresh", { method: "POST" });
  assert.equal(r.data.checked, 4);
  const rows = (await anon("streamers?select=handle,is_live,viewers")).data;
  const ricky = rows.find((x) => x.handle === "rickystarsab");
  assert.equal(ricky.is_live, true);
  assert.equal(ricky.viewers, 777);
  assert.equal(rows.find((x) => x.handle === "kazuhiko_mayuko").is_live, false);
  // concurrent calls do not double-check
  sql("update streamers set live_checked_at = now() - interval '2 minutes'");
  const [a, b, c] = await Promise.all([1, 2, 3].map(() => guest.req("/api/streamers/refresh", { method: "POST" })));
  assert.equal(a.data.checked + b.data.checked + c.data.checked, 4);
  // goes offline
  setLive({});
  sql("update streamers set live_checked_at = now() - interval '2 minutes'");
  await guest.req("/api/streamers/refresh", { method: "POST" });
  const after = (await anon("streamers?select=handle,is_live&handle=eq.rickystarsab")).data[0];
  assert.equal(after.is_live, false);
});

test("edit / reorder / delete streamers", async () => {
  let r = await admin.req(`/api/streamers/${state.kaz.id}`, { method: "PATCH", body: { manualLive: true, side: "right", displayName: "KAZ PRO" } });
  assert.equal(r.status, 200);
  assert.equal(r.data.streamer.side, "right");
  assert.equal(r.data.streamer.manual_live, true);
  assert.equal(r.data.streamer.display_name, "KAZ PRO");
  r = await admin.req(`/api/streamers/${state.kaz.id}`, { method: "PATCH", body: { paidUntil: "2020-01-01T00:00:00Z" } });
  assert.equal(r.data.streamer.paid_until, "2020-01-01T00:00:00+00:00");
  r = await admin.req(`/api/streamers/${state.kaz.id}`, { method: "PATCH", body: { paidUntil: null, manualLive: null, action: "refresh" } });
  assert.equal(r.data.streamer.paid_until, null);
  assert.equal(r.data.streamer.manual_live, null);
  r = await admin.req("/api/streamers/reorder", { body: { ids: [state.manual.id, state.ricky.id, state.kaz.id] } });
  assert.equal(r.status, 200);
  assert.equal(sql(`select string_agg(handle, ',' order by sort_order) from streamers where side='right'`), "unknown_person,rickystarsab,kazuhiko_mayuko");
  r = await admin.req(`/api/streamers/${state.deets.id}`, { method: "DELETE" });
  assert.equal(r.status, 200);
  assert.equal(sql(`select count(*) from streamers`), "3");
});

test("image upload (admin only, type + size checked)", async () => {
  const pngBytes = fs.readFileSync(new URL("../fixtures/brainrot.png", import.meta.url));
  const f = new FormData();
  f.append("file", new Blob([pngBytes], { type: "image/png" }), "b.png");
  let r = await admin.req("/api/upload", { form: f });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  state.image = r.data.url;
  const img = await fetch(state.image);
  assert.equal(img.status, 200);
  const bad = new FormData();
  bad.append("file", new Blob(["hello"], { type: "text/plain" }), "x.txt");
  r = await admin.req("/api/upload", { form: bad });
  assert.equal(r.data.error, "BAD_FILE_TYPE");
  const big = new FormData();
  big.append("file", new Blob([new Uint8Array(Math.round(4.2 * 1024 * 1024))], { type: "image/png" }), "big.png");
  r = await admin.req("/api/upload", { form: big });
  assert.equal(r.data.error, "FILE_TOO_BIG");
});

test("contest: create, join rules, capacity, timer edits, fair draw", async () => {
  let r = await admin.req("/api/contest", { body: { title: "Test Giveaway", prize: "Skibidi", imageUrl: state.image, durationSeconds: 12, maxParticipants: 3 } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const c = r.data.contest;
  state.c = c;
  assert.equal(c.status, "active");
  assert.match(c.code, /^[A-Za-z0-9]{10}$/);
  assert.equal(c.server_seed, null);
  assert.match(c.server_seed_hash, /^[0-9a-f]{64}$/);

  r = await admin.req("/api/contest", { body: { durationSeconds: 60 } });
  assert.equal(r.data.error, "ACTIVE_CONTEST_EXISTS");

  r = await guest.req(`/api/contest/${c.id}/join`, { method: "POST" });
  assert.equal(r.data.error, "NO_NICKNAME");

  r = await p1.req(`/api/contest/${c.id}/join`, { method: "POST" });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.entry.ticket, 0);
  r = await p1.req(`/api/contest/${c.id}/join`, { method: "POST" });
  assert.equal(r.data.error, "ALREADY_JOINED");

  // concurrent joins: exactly 2 more fit
  const results = await Promise.all([p2, p3, p4].map((p) => p.req(`/api/contest/${c.id}/join`, { method: "POST" })));
  const ok = results.filter((x) => x.status === 200);
  const full = results.filter((x) => x.data.error === "CONTEST_FULL");
  assert.equal(ok.length, 2);
  assert.equal(full.length, 1);
  assert.equal(sql(`select entries_count from contests where id='${c.id}'`), "3");
  assert.equal(sql(`select string_agg(ticket::text, ',' order by ticket) from contest_entries where contest_id='${c.id}'`), "0,1,2");

  // raise limit -> the 4th can join
  r = await admin.req(`/api/contest/${c.id}`, { method: "PATCH", body: { maxParticipants: null } });
  assert.equal(r.data.contest.max_participants, null);
  const late = results.findIndex((x) => x.data.error === "CONTEST_FULL");
  r = await [p2, p3, p4][late].req(`/api/contest/${c.id}/join`, { method: "POST" });
  assert.equal(r.status, 200);
  assert.equal(r.data.entry.ticket, 3);

  // timer edits
  const end0 = new Date(state.c.ends_at).getTime();
  r = await admin.req(`/api/contest/${c.id}`, { method: "PATCH", body: { addSeconds: 60 } });
  assert.ok(Math.abs(new Date(r.data.contest.ends_at).getTime() - (end0 + 60000)) < 50);
  r = await admin.req(`/api/contest/${c.id}`, { method: "PATCH", body: { addSeconds: -60 } });
  assert.ok(Math.abs(new Date(r.data.contest.ends_at).getTime() - end0) < 50);
  r = await admin.req(`/api/contest/${c.id}`, { method: "PATCH", body: { addSeconds: -3600 } });
  assert.ok(new Date(r.data.contest.ends_at).getTime() > Date.now(), "never moved to the past");
  r = await admin.req(`/api/contest/${c.id}`, { method: "PATCH", body: { endsAt: new Date(Date.now() + 4000).toISOString(), title: "Renamed" } });
  assert.equal(r.data.contest.title, "Renamed");

  // draw before end does nothing
  let d = await anon("rpc/draw_contest", { method: "POST", body: { p_contest: c.id } });
  assert.equal(d.data.status, "active");
  assert.equal(d.data.server_seed, null);

  await sleep(4500);
  r = await p1.req(`/api/contest/${c.id}/join`, { method: "POST" });
  // p1 already joined; a new player cannot join after the end
  const late2 = new Client();
  await late2.req("/api/player", { body: { nickname: "LateGuy" } });
  r = await late2.req(`/api/contest/${c.id}/join`, { method: "POST" });
  assert.equal(r.data.error, "CONTEST_CLOSED");

  d = await anon("rpc/draw_contest", { method: "POST", body: { p_contest: c.id } });
  assert.equal(d.data.status, "finished");
  assert.ok(d.data.winner_nickname);
  const again = await anon("rpc/draw_contest", { method: "POST", body: { p_contest: c.id } });
  assert.equal(again.data.winner_entry_id, d.data.winner_entry_id, "idempotent");

  // independent verification (same algorithm as the /history page)
  const { verifyContest } = await import("../../src/lib/fair.ts");
  const entries = (await anon(`contest_entries?select=ticket,nickname&contest_id=eq.${c.id}&order=ticket`)).data;
  const v = await verifyContest({
    code: d.data.code,
    serverSeed: d.data.server_seed,
    serverSeedHash: c.server_seed_hash,
    clientSeed: d.data.client_seed,
    winnerIndex: d.data.winner_index,
    winnerNickname: d.data.winner_nickname,
    entries,
  });
  assert.ok(v.seedHashOk && v.clientSeedOk && v.winnerOk, JSON.stringify(v));
  state.finished = d.data;

  // after finish timer edits are refused, but a new contest can start
  r = await admin.req(`/api/contest/${c.id}`, { method: "PATCH", body: { addSeconds: 60 } });
  assert.equal(r.data.error, "CONTEST_CLOSED");
});

test("contest: end now, cancel, empty draw, delete", async () => {
  let r = await admin.req("/api/contest", { body: { durationSeconds: 3600 } });
  const c2 = r.data.contest;
  await p2.req(`/api/contest/${c2.id}/join`, { method: "POST" });
  r = await admin.req(`/api/contest/${c2.id}`, { method: "PATCH", body: { action: "end" } });
  assert.equal(r.data.contest.status, "finished");
  assert.equal(r.data.contest.winner_nickname, "Alpha");

  r = await admin.req("/api/contest", { body: { durationSeconds: 3600 } });
  const c3 = r.data.contest;
  r = await admin.req(`/api/contest/${c3.id}`, { method: "PATCH", body: { action: "cancel" } });
  assert.equal(r.data.contest.status, "cancelled");
  r = await p1.req(`/api/contest/${c3.id}/join`, { method: "POST" });
  assert.equal(r.data.error, "CONTEST_CLOSED");

  r = await admin.req("/api/contest", { body: { durationSeconds: 10 } });
  const c4 = r.data.contest;
  r = await admin.req(`/api/contest/${c4.id}`, { method: "PATCH", body: { action: "end" } });
  assert.equal(r.data.contest.status, "finished");
  assert.equal(r.data.contest.winner_nickname, null);

  r = await admin.req(`/api/contest/${c3.id}`, { method: "DELETE" });
  assert.equal(r.status, 200);
  r = await admin.req(`/api/contest/${c4.id}`, { method: "DELETE" });
  assert.equal(sql(`select count(*) from contests`), "2");

  r = await p1.req(`/api/contest/not-a-uuid/join`, { method: "POST" });
  assert.equal(r.status, 404);
});

test("expired contests are drawn by the refresher", async () => {
  let r = await admin.req("/api/contest", { body: { durationSeconds: 10 } });
  const c = r.data.contest;
  await p3.req(`/api/contest/${c.id}/join`, { method: "POST" });
  sql(`update contests set ends_at = now() - interval '1 second' where id='${c.id}'`);
  r = await guest.req("/api/streamers/refresh", { method: "POST" });
  assert.equal(r.data.drawn, 1);
  assert.equal(sql(`select status || ':' || winner_nickname from contests where id='${c.id}'`), "finished:Бетон_3");
});

test("participation conditions: saved, edited, cleaned; old DB without column still works", async () => {
  let r = await admin.req("/api/contest", {
    body: { durationSeconds: 600, title: "Cond Test", conditions: " 1. Follow @x on TikTok \n\n  Join https://discord.gg/nnnhQW3z54  \n" },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  const c = r.data.contest;
  assert.equal(c.conditions, "1. Follow @x on TikTok\nJoin https://discord.gg/nnnhQW3z54");
  assert.equal(r.data.warning, undefined);
  const pub = await anon(`contests?select=conditions&id=eq.${c.id}`);
  assert.equal(pub.data[0].conditions, c.conditions, "public can read conditions");

  r = await admin.req(`/api/contest/${c.id}`, { method: "PATCH", body: { conditions: "Only one rule" } });
  assert.equal(r.data.contest.conditions, "Only one rule");
  r = await admin.req(`/api/contest/${c.id}`, { method: "PATCH", body: { conditions: "   " } });
  assert.equal(r.data.contest.conditions, null);

  // simulate a Supabase project that has not run the update yet
  sql("alter table contests drop column conditions; notify pgrst, 'reload schema';");
  await sleep(1500);
  try {
    r = await admin.req(`/api/contest/${c.id}`, { method: "PATCH", body: { conditions: "x", title: "Still Saved" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.warning, "MIGRATION_NEEDED");
    assert.equal(r.data.contest.title, "Still Saved");
    await admin.req(`/api/contest/${c.id}`, { method: "PATCH", body: { action: "cancel" } });
    r = await admin.req("/api/contest", { body: { durationSeconds: 60, conditions: "rule" } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.warning, "MIGRATION_NEEDED");
    await admin.req(`/api/contest/${r.data.contest.id}`, { method: "PATCH", body: { action: "cancel" } });
  } finally {
    // the one-line migration from supabase/migrations restores it
    execSync(`psql "${DB}" -q -f supabase/migrations/002_contest_conditions.sql`);
    await sleep(1500);
  }
  r = await admin.req("/api/contest", { body: { durationSeconds: 60, conditions: "back" } });
  assert.equal(r.data.contest.conditions, "back");
  await admin.req(`/api/contest/${r.data.contest.id}`, { method: "PATCH", body: { action: "cancel" } });
});
