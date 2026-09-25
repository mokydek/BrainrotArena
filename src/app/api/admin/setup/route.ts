import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import { fail, guardAdmin, json } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

function databaseUrl(): string {
  return (
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    ""
  );
}

/** Creates / updates all tables & functions (runs supabase/schema.sql). Admin only. */
export async function POST() {
  const denied = await guardAdmin();
  if (denied) return denied;

  const raw = databaseUrl();
  if (!raw) return fail("NO_DATABASE_URL", 400);

  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("supa");
  const local = ["localhost", "127.0.0.1"].includes(url.hostname);

  const sql = await readFile(path.join(process.cwd(), "supabase", "schema.sql"), "utf8");
  const client = new Client({ connectionString: url.toString(), ssl: local ? false : { rejectUnauthorized: false } });
  try {
    await client.connect();
    await client.query(sql);
    return json({ ok: true });
  } catch (e) {
    return fail("SETUP_FAILED", 500, { message: e instanceof Error ? e.message : String(e) });
  } finally {
    await client.end().catch(() => {});
  }
}
