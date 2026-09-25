// Fresh Supabase project without tables: setup screen -> admin login -> "Create tables" -> site works.
import { chromium } from "playwright";
import assert from "node:assert/strict";
const BASE = "http://localhost:3000";
const b = await chromium.launch();
const p = await b.newPage();
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
try {
  await p.goto(BASE);
  await p.getByText("Setup required").waitFor();
  await p.getByText("not initialised").waitFor();
  await p.getByRole("link", { name: "Admin login" }).click();
  await p.getByTestId("admin-password").fill("test-admin-pass");
  await p.getByTestId("admin-login").click();
  await p.waitForURL(`${BASE}/`);
  await p.getByTestId("init-db").click();
  await p.getByTestId("contest").waitFor({ timeout: 15000 });
  await p.getByTestId("admin-badge").waitFor();
  assert.equal(await p.getByTestId("add-streamer-left").count(), 1);
  assert.deepEqual(errors, []);
  console.log("SETUP FLOW PASSED");
} catch (e) {
  console.error("SETUP FLOW FAILED", e, errors);
  await p.screenshot({ path: "/tmp/setup-fail.png" });
  process.exitCode = 1;
} finally {
  await b.close();
}
