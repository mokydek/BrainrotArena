// End-to-end UI test with real browsers (admin + 3 players, desktop & mobile).
// Needs: local stack (tests/local/start.sh) + `next start` with the fetch mock.
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SHOTS = path.resolve("tests/e2e/screenshots");
const IMG = path.resolve("tests/fixtures/brainrot.png");
fs.mkdirSync(SHOTS, { recursive: true });
fs.writeFileSync("/tmp/ba-live.json", JSON.stringify({ kazuhiko_mayuko: 1234 }));

const errors = [];
const IGNORED = /WebSocket|realtime|websocket|Failed to load resource/i;
function watch(page, name) {
  page.on("pageerror", (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORED.test(m.text())) errors.push(`[${name}] console: ${m.text()}`);
  });
}
const step = (s) => console.log(`• ${s}`);
async function anon(p) {
  const r = await fetch(`${SB}/rest/v1/${p}`, { headers: { apikey: ANON, authorization: `Bearer ${ANON}` } });
  return r.json();
}

const browser = await chromium.launch();
try {
  // ---------------------------------------------------------------- admin
  const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const admin = await adminCtx.newPage();
  watch(admin, "admin");

  step("empty site renders");
  await admin.goto(BASE);
  await admin.getByTestId("contest").waitFor();
  assert.equal(await admin.getByTestId("add-streamer-left").count(), 0, "no + for visitors");
  await admin.screenshot({ path: `${SHOTS}/01-empty.png` });

  step("admin login");
  await admin.goto(`${BASE}/admin`);
  await admin.getByTestId("admin-password").fill("wrong");
  await admin.getByTestId("admin-login").click();
  await admin.locator(".form-error").waitFor();
  await admin.getByTestId("admin-password").fill("test-admin-pass");
  await admin.getByTestId("admin-login").click();
  await admin.waitForURL(`${BASE}/`);
  await admin.getByTestId("admin-badge").waitFor();
  assert.equal(await admin.getByTestId("add-streamer-left").count(), 1);
  assert.equal(await admin.getByTestId("add-streamer-right").count(), 1);

  step("admin adds streamers via + (auto-fetched from TikTok links)");
  const toAdd = [
    ["left", "https://www.tiktok.com/@deets_gaming"],
    ["left", "https://www.tiktok.com/@kazuhiko_mayuko"],
    ["left", "tiktok.com/@frexx180"],
    ["right", "https://www.tiktok.com/@rickystarsab"],
    ["right", "https://vm.tiktok.com/ZMshort/"],
    ["right", "https://www.tiktok.com/@unknown_person", "EXAMPLE"],
  ];
  for (const [side, url, manualName] of toAdd) {
    await admin.getByTestId(`add-streamer-${side}`).click();
    await admin.getByTestId("streamer-url").fill(url);
    await admin.getByTestId("streamer-fetch").click();
    await admin.locator(".preview-box").waitFor();
    if (manualName) {
      await admin.locator(".form-warn").waitFor(); // "couldn't auto-fetch" warning
      await admin.getByTestId("streamer-name-input").fill(manualName);
    }
    if (url.includes("kazuhiko")) await admin.screenshot({ path: `${SHOTS}/02-add-streamer-modal.png` });
    await admin.getByTestId("streamer-save").click();
    await admin.locator(".modal").waitFor({ state: "detached" });
  }
  await admin.waitForFunction(() => document.querySelectorAll("[data-testid=streamer-card]").length === 6);
  const leftNames = await admin.getByTestId("panel-left").getByTestId("streamer-name").allTextContents();
  assert.equal(leftNames[0], "KAZ", `live streamer first, got ${leftNames}`);
  assert.equal(await admin.getByTestId("panel-left").getByTestId("streamer-card").first().getAttribute("data-live"), "1");
  const rightNames = await admin.getByTestId("panel-right").getByTestId("streamer-name").allTextContents();
  assert.deepEqual(rightNames, ["RICKYSTARSAB", "GOJOBTWW", "EXAMPLE"]);

  step("admin edits a streamer (force live) -> jumps to top");
  const ex = admin.getByTestId("panel-right").getByTestId("streamer-card").nth(2);
  await ex.hover();
  await ex.getByTestId("streamer-edit").click();
  await admin.getByRole("button", { name: /Always live/ }).click();
  await admin.getByTestId("streamer-save").click();
  await admin.locator(".modal").waitFor({ state: "detached" });
  await admin.waitForFunction(() => document.querySelector("[data-testid=panel-right] [data-testid=streamer-name]")?.textContent === "EXAMPLE");

  step("admin creates a giveaway with an uploaded brainrot image");
  await admin.getByTestId("contest-new").click();
  await admin.getByTestId("contest-prize-input").fill("Skibidi Toilet");
  await admin.getByTestId("contest-image-file").setInputFiles(IMG);
  await admin.getByTestId("contest-image-preview").waitFor();
  await admin.getByRole("button", { name: "5m", exact: true }).click();
  await admin.screenshot({ path: `${SHOTS}/03-new-contest-modal.png` });
  await admin.getByTestId("contest-save").click();
  await admin.locator(".modal").waitFor({ state: "detached" });
  await admin.locator(".stage img.brainrot").waitFor();
  const code = await admin.getByTestId("contest-code").textContent();
  assert.match(code, /^[A-Za-z0-9]{10}$/);
  await admin.waitForFunction(() => document.querySelector(".die.d3 .die-face")?.textContent?.startsWith("04"));

  step("timer +1 / -1 buttons");
  await admin.getByTestId("timer-plus-1").click();
  await admin.waitForFunction(() => document.querySelector(".die.d3 .die-face")?.textContent?.startsWith("05"));
  await admin.getByTestId("timer-minus-1").click();
  await admin.waitForFunction(() => document.querySelector(".die.d3 .die-face")?.textContent?.startsWith("04"));

  // ---------------------------------------------------------------- players
  const p1Ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const p2Ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const p3Ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const p1 = await p1Ctx.newPage();
  const p2 = await p2Ctx.newPage();
  const p3 = await p3Ctx.newPage();
  watch(p1, "p1");
  watch(p2, "p2");
  watch(p3, "p3");
  await Promise.all([p1.goto(BASE), p2.goto(BASE), p3.goto(BASE)]);

  step("p1 sets nickname (pinned at top) and joins");
  await p1.getByTestId("nick-input").fill("SkibidiFan");
  await p1.getByTestId("nick-hint").filter({ hasText: /free/i }).waitFor();
  await p1.getByTestId("nick-save").click();
  await p1.getByTestId("nick-value").filter({ hasText: "SkibidiFan" }).waitFor();
  await p1.getByTestId("join-btn").click();
  await p1.getByTestId("join-btn").filter({ hasText: "YOU'RE IN" }).waitFor();
  assert.match(await p1.getByTestId("join-sub").textContent(), /#1/);

  step("p2 (mobile) cannot take the same nickname in another case");
  await p2.getByTestId("nick-input").fill("SKIBIDIFAN");
  await p2.getByTestId("nick-hint").filter({ hasText: /taken/i }).waitFor();
  await p2.getByTestId("nick-save").click();
  await p2.waitForTimeout(500);
  assert.equal(await p2.getByTestId("nick-pill").count(), 0);
  await p2.getByTestId("nick-input").fill("Тралалело");
  await p2.getByTestId("nick-save").click();
  await p2.getByTestId("nick-value").filter({ hasText: "Тралалело" }).waitFor();
  await p2.getByTestId("join-btn").click();
  await p2.getByTestId("join-btn").filter({ hasText: "YOU'RE IN" }).waitFor();

  step("p3 clicks join without nickname -> asked for nickname first");
  await p3.getByTestId("join-btn").click();
  await p3.locator(".toast").filter({ hasText: /nickname/i }).waitFor();
  await p3.waitForFunction(() => document.activeElement?.getAttribute("data-testid") === "nick-input", null, { timeout: 3000 });
  await p3.getByTestId("nick-input").fill("Brr_Brr");
  await p3.getByTestId("nick-save").click();
  await p3.getByTestId("nick-value").waitFor();
  await p3.getByTestId("join-btn").click();
  await p3.getByTestId("join-btn").filter({ hasText: "YOU'RE IN" }).waitFor();

  step("nickname + participation persist after reload");
  await p1.reload();
  await p1.getByTestId("nick-value").filter({ hasText: "SkibidiFan" }).waitFor();
  await p1.getByTestId("join-btn").filter({ hasText: "YOU'RE IN" }).waitFor();

  step("everyone sees the participant list update");
  for (const pg of [admin, p1, p2]) {
    await pg.waitForFunction(() => document.querySelectorAll("[data-testid=player-chips] .player-chip").length === 3, null, { timeout: 12000 });
  }
  await p1.screenshot({ path: `${SHOTS}/04-player-desktop.png` });
  await p2.screenshot({ path: `${SHOTS}/05-player-mobile.png`, fullPage: true });
  await admin.screenshot({ path: `${SHOTS}/06-admin-view.png`, fullPage: true });

  step("admin ends the giveaway -> reel -> same winner for everyone");
  await admin.getByTestId("contest-end").click();
  await admin.getByTestId("confirm-yes").click();
  await admin.getByTestId("winner-reel").waitFor({ timeout: 5000 });
  await admin.waitForTimeout(1500);
  await admin.screenshot({ path: `${SHOTS}/07-reel.png` });
  const winners = [];
  for (const pg of [admin, p1, p2, p3]) {
    await pg.getByTestId("winner-nick").waitFor({ timeout: 20000 });
    winners.push((await pg.getByTestId("winner-nick").textContent()).trim());
  }
  const db = (await anon(`contests?select=winner_nickname,status&code=eq.${code}`))[0];
  assert.equal(db.status, "finished");
  assert.deepEqual(winners, [db.winner_nickname, db.winner_nickname, db.winner_nickname, db.winner_nickname]);
  assert.ok(["SkibidiFan", "Тралалело", "Brr_Brr"].includes(db.winner_nickname));
  console.log(`  winner: ${db.winner_nickname}`);
  await admin.waitForTimeout(800);
  await admin.screenshot({ path: `${SHOTS}/08-winner.png` });
  const winnerPage = { SkibidiFan: p1, "Тралалело": p2, Brr_Brr: p3 }[db.winner_nickname];
  await winnerPage.locator(".you-won").waitFor();
  await p2.screenshot({ path: `${SHOTS}/09-winner-mobile.png` });

  step("history page verifies the draw in the browser");
  await p1.goto(`${BASE}/history#${code}`);
  await p1.getByTestId("verify-btn").first().click();
  await p1.getByTestId("verify-result").filter({ hasText: "Verified" }).waitFor();
  await p1.screenshot({ path: `${SHOTS}/10-history.png` });

  step("language switch to RU");
  await p1.goto(BASE);
  await p1.getByRole("button", { name: "RU", exact: true }).click();
  await p1.locator(".panel-title").filter({ hasText: "НАШИ ТОП СТРИМЕРЫ" }).first().waitFor();
  await p1.reload();
  await p1.locator(".panel-title").filter({ hasText: "НАШИ ТОП СТРИМЕРЫ" }).first().waitFor(); // SSR keeps language
  await p1.screenshot({ path: `${SHOTS}/11-ru.png` });

  step("capacity limit in UI (max 1 player) + last winner card");
  await admin.getByTestId("contest-new").click();
  await admin.getByTestId("contest-title-input").fill("VIP DROP");
  await admin.getByTestId("contest-max").fill("1");
  await admin.getByTestId("contest-save").click();
  await admin.locator(".modal").waitFor({ state: "detached" });
  await admin.getByTestId("last-winner").filter({ hasText: db.winner_nickname }).waitFor();
  await p3.reload();
  await p3.getByTestId("join-btn").click();
  await p3.getByTestId("join-btn").filter({ hasText: "YOU'RE IN" }).waitFor();
  await p2.reload();
  await p2.getByTestId("join-btn").filter({ hasText: "FULL" }).waitFor();
  assert.equal(await p2.getByTestId("join-btn").isDisabled(), true);

  step("expired paid slot is hidden for visitors but visible (dimmed) to admin");
  const exCard = admin.getByTestId("panel-left").getByTestId("streamer-card").last();
  await exCard.hover();
  await exCard.getByTestId("streamer-edit").click();
  await admin.locator(".modal input[type=datetime-local]").waitFor({ state: "detached" }).catch(() => {});
  await admin.getByRole("button", { name: /^1 day$/ }).click();
  await admin.locator(".modal input[type=datetime-local]").fill("2020-01-01T10:00");
  await admin.getByTestId("streamer-save").click();
  await admin.locator(".modal").waitFor({ state: "detached" });
  await admin.locator(".streamer-card.expired").waitFor();
  await p1.reload();
  assert.equal(await p1.getByTestId("panel-left").getByTestId("streamer-card").count(), 2);

  console.log(errors.length ? `\nBROWSER ERRORS:\n${errors.join("\n")}` : "\nno browser errors");
  if (errors.length) process.exitCode = 1;
  console.log("UI E2E PASSED");
} catch (e) {
  console.error("UI E2E FAILED:", e);
  console.log(errors.join("\n"));
  process.exitCode = 1;
} finally {
  await browser.close();
}
