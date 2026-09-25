import { chromium } from "playwright";
import fs from "node:fs";
const svg = fs.readFileSync(new URL("../fixtures/brainrot.svg", import.meta.url), "utf8");
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 672, height: 560 } });
await p.setContent(`<html><body style="margin:0">${svg}</body></html>`);
await p.screenshot({ path: new URL("../fixtures/brainrot.png", import.meta.url).pathname });
await b.close();
