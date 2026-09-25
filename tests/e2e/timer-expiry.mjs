// Timer runs out on its own -> visitors' browsers trigger the draw -> reel -> winner (no admin action).
import { chromium } from "playwright";
import assert from "node:assert/strict";

const BASE = "http://localhost:3000";
async function call(path, body, cookie) {
  const r = await fetch(BASE + path, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  return { data: await r.json(), cookie: (r.headers.getSetCookie?.() || []).map((c) => c.split(";")[0]).join("; ") };
}

const admin = await call("/api/admin/login", { password: "test-admin-pass" });
const c = await call("/api/contest", { title: "Timer Test", durationSeconds: 12 }, admin.cookie);
assert.ok(c.data.ok, JSON.stringify(c.data));
const names = ["TimerOne", "TimerTwo"];
for (const n of names) {
  const p = await call("/api/player", { nickname: n });
  const j = await call(`/api/contest/${c.data.contest.id}/join`, {}, p.cookie);
  assert.ok(j.data.ok, JSON.stringify(j.data));
}

const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(BASE);
  await page.getByTestId("contest-title").filter({ hasText: "Timer Test" }).waitFor();
  await page.getByTestId("winner-reel").waitFor({ timeout: 25000 });
  await page.getByTestId("winner-nick").waitFor({ timeout: 15000 });
  const w = (await page.getByTestId("winner-nick").textContent()).trim();
  assert.ok(names.includes(w), w);
  assert.deepEqual(errors, []);
  console.log(`TIMER EXPIRY PASSED (winner ${w})`);
} catch (e) {
  console.error("TIMER EXPIRY FAILED", e, errors);
  process.exitCode = 1;
} finally {
  await b.close();
}
