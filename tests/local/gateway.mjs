// Minimal local stand-in for the Supabase API gateway used by tests:
//   /rest/v1/*     -> PostgREST (real Postgres, real RLS & functions)
//   /storage/v1/*  -> tiny file-system storage mock (bucket get/create, upload, public read, remove)
//   /realtime/v1/* -> not implemented (the app falls back to polling)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const PORT = Number(process.env.GATEWAY_PORT || 54321);
const PGRST = process.env.PGRST_URL || "http://127.0.0.1:3001";
const SECRET = process.env.JWT_SECRET;
const STORE = process.env.STORAGE_DIR || "/tmp/ba-storage";
fs.mkdirSync(STORE, { recursive: true });
const bucketsFile = path.join(STORE, "_buckets.json");
const buckets = fs.existsSync(bucketsFile) ? JSON.parse(fs.readFileSync(bucketsFile, "utf8")) : {};
const saveBuckets = () => fs.writeFileSync(bucketsFile, JSON.stringify(buckets));
const types = {};

function roleOf(req) {
  const auth = req.headers.authorization || "";
  const tok = auth.replace(/^Bearer\s+/i, "") || req.headers.apikey || "";
  const [h, p, s] = tok.split(".");
  if (!s) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(`${h}.${p}`).digest("base64url");
  if (expected !== s) return null;
  return JSON.parse(Buffer.from(p, "base64url").toString()).role;
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD");
  res.setHeader("Access-Control-Expose-Headers", "*");
}

function send(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function body(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

async function storage(req, res, p) {
  const role = roleOf(req);
  let m;
  if ((m = p.match(/^\/bucket\/([^/]+)$/)) && req.method === "GET") {
    const b = buckets[m[1]];
    return b ? send(res, 200, b) : send(res, 400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
  }
  if (p === "/bucket" && req.method === "POST") {
    if (role !== "service_role") return send(res, 403, { statusCode: "403", error: "Unauthorized", message: "no" });
    const b = JSON.parse((await body(req)).toString() || "{}");
    if (buckets[b.id]) return send(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
    buckets[b.id] = { id: b.id, name: b.name || b.id, public: !!b.public };
    saveBuckets();
    return send(res, 200, { name: b.id });
  }
  if ((m = p.match(/^\/object\/public\/([^/]+)\/(.+)$/)) && (req.method === "GET" || req.method === "HEAD")) {
    const file = path.join(STORE, m[1], decodeURIComponent(m[2]));
    if (!buckets[m[1]]?.public || !fs.existsSync(file)) return send(res, 404, { error: "not_found" });
    res.writeHead(200, { "Content-Type": types[file] || "application/octet-stream", "Cache-Control": "no-cache" });
    return res.end(req.method === "HEAD" ? undefined : fs.readFileSync(file));
  }
  if ((m = p.match(/^\/object\/([^/]+)$/)) && req.method === "DELETE") {
    if (role !== "service_role") return send(res, 403, { error: "Unauthorized" });
    const { prefixes = [] } = JSON.parse((await body(req)).toString() || "{}");
    const removed = [];
    for (const pr of prefixes) {
      const file = path.join(STORE, m[1], pr);
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
        removed.push({ name: pr });
      }
    }
    return send(res, 200, removed);
  }
  if ((m = p.match(/^\/object\/([^/]+)\/(.+)$/)) && (req.method === "POST" || req.method === "PUT")) {
    if (role !== "service_role") return send(res, 403, { statusCode: "403", error: "Unauthorized", message: "new row violates row-level security policy" });
    if (!buckets[m[1]]) return send(res, 400, { statusCode: "404", error: "Bucket not found", message: "Bucket not found" });
    const rel = decodeURIComponent(m[2]);
    const file = path.join(STORE, m[1], rel);
    if (req.method === "POST" && req.headers["x-upsert"] !== "true" && fs.existsSync(file))
      return send(res, 400, { statusCode: "409", error: "Duplicate", message: "The resource already exists" });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await body(req));
    types[file] = req.headers["content-type"];
    return send(res, 200, { Key: `${m[1]}/${rel}`, Id: crypto.randomUUID() });
  }
  return send(res, 404, { error: "storage route not mocked", path: p, method: req.method });
}

function proxy(req, res, target) {
  const u = new URL(target);
  const headers = { ...req.headers, host: u.host };
  const up = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: req.method, headers }, (r) => {
    res.writeHead(r.statusCode, r.headers);
    r.pipe(res);
  });
  up.on("error", (e) => send(res, 502, { error: String(e) }));
  req.pipe(up);
}

http
  .createServer(async (req, res) => {
    cors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      return res.end();
    }
    const url = new URL(req.url, "http://x");
    if (url.pathname.startsWith("/rest/v1")) return proxy(req, res, PGRST + url.pathname.slice("/rest/v1".length) + url.search);
    if (url.pathname.startsWith("/storage/v1")) return storage(req, res, url.pathname.slice("/storage/v1".length));
    send(res, 404, { error: "not found" });
  })
  .listen(PORT, () => console.log(`gateway on :${PORT}`));
