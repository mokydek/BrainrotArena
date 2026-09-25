import { fail, guardAdmin, json, readJson } from "@/lib/http";
import { fetchSocialProfile } from "@/lib/social/fetch";

export const maxDuration = 60;

/** Admin: fetch avatar / nickname / live status from a social link without saving. */
export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const body = await readJson<{ url?: string }>(req);
  const url = String(body?.url ?? "").trim();
  if (!url) return fail("BAD_LINK");
  const profile = await fetchSocialProfile(url);
  if ("error" in profile && !("platform" in profile)) return fail(profile.error);
  return json({ ok: true, profile });
}
