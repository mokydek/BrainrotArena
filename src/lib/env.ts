// Accepts both classic Supabase key names and the Vercel/Supabase integration names.

// Project defaults (public values — the anon key is shipped to every browser anyway and is
// protected by RLS). Environment variables, when set, always take priority.
const DEFAULT_SUPABASE_URL = "https://vuknddvhpwkyjvrypaql.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ1a25kZHZocHdreWp2cnlwYXFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMzYzMjQsImV4cCI6MjEwNTkxMjMyNH0.Osozw8YZv-iakL6pYzXnrN3x_sJDu6eXxe53WHuYxUc";

const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";

export const SUPABASE_URL = (envUrl || DEFAULT_SUPABASE_URL).replace(/\/$/, "");

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  (envUrl ? "" : DEFAULT_SUPABASE_ANON_KEY);

export function serviceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";
}

export function adminPassword(): string {
  return process.env.ADMIN_PASSWORD || "";
}

export function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && serviceRoleKey() && adminPassword());
}

export function missingEnv(): string[] {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!serviceRoleKey()) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!adminPassword()) missing.push("ADMIN_PASSWORD");
  return missing;
}

export const STORAGE_BUCKET = "media";
