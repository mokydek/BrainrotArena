import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, serviceRoleKey } from "@/lib/env";

let admin: SupabaseClient | null = null;

/** Service-role client. Server only — never import from client components. */
export function supabaseAdmin(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("supabaseAdmin() is server-only");
  if (!admin) {
    admin = createClient(SUPABASE_URL, serviceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
    });
  }
  return admin;
}
