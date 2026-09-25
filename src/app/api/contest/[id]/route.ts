import { fail, guardAdmin, isMissingColumn, json, readJson } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Contest } from "@/lib/types";
import { httpUrl, intOrNull, isoDate, lines, str } from "@/lib/validate";

type Ctx = { params: Promise<{ id: string }> };

type Body = {
  action?: "end" | "cancel";
  title?: string;
  prize?: string | null;
  imageUrl?: string | null;
  maxParticipants?: number | null;
  endsAt?: string;
  addSeconds?: number;
  conditions?: string | null;
};

/** Admin: edit timer / image / limits, end now or cancel. */
export async function PATCH(req: Request, ctx: Ctx) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const body = await readJson<Body>(req);
  if (!body) return fail("BAD_REQUEST");

  const sb = supabaseAdmin();
  const { data: cur } = await sb.from("contests").select("*").eq("id", id).maybeSingle();
  if (!cur) return fail("NOT_FOUND", 404);
  const c = cur as Contest;

  if (body.action === "end") {
    if (c.status !== "active") return fail("CONTEST_CLOSED");
    await sb.from("contests").update({ ends_at: new Date(Date.now() - 1000).toISOString() }).eq("id", id);
    const { data, error } = await sb.rpc("draw_contest", { p_contest: id });
    if (error) return fail("DB_ERROR", 500, { message: error.message });
    return json({ ok: true, contest: data });
  }

  if (body.action === "cancel") {
    if (c.status !== "active") return fail("CONTEST_CLOSED");
    const { data, error } = await sb.from("contests").update({ status: "cancelled" }).eq("id", id).eq("status", "active").select("*").single();
    if (error) return fail("DB_ERROR", 500);
    return json({ ok: true, contest: data });
  }

  const patch: Partial<Contest> = {};
  if ("title" in body) patch.title = str(body.title, 80) || c.title;
  if ("prize" in body) patch.prize = str(body.prize, 120);
  if ("imageUrl" in body) patch.image_url = body.imageUrl ? httpUrl(body.imageUrl) : null;
  if ("conditions" in body) patch.conditions = lines(body.conditions);

  const timingChange = "maxParticipants" in body || "endsAt" in body || "addSeconds" in body;
  if (timingChange && c.status !== "active") return fail("CONTEST_CLOSED");
  if ("maxParticipants" in body) patch.max_participants = intOrNull(body.maxParticipants, 1, 1_000_000);

  if ("endsAt" in body || "addSeconds" in body) {
    let end: number;
    if (body.endsAt) {
      const iso = isoDate(body.endsAt);
      if (!iso) return fail("BAD_END_TIME");
      end = new Date(iso).getTime();
    } else {
      end = new Date(c.ends_at).getTime() + (Number(body.addSeconds) || 0) * 1000;
    }
    // never put the timer in the past by accident — use "end" action for that
    end = Math.max(end, Date.now() + 3000);
    patch.ends_at = new Date(end).toISOString();
  }

  if (!Object.keys(patch).length) return json({ ok: true, contest: c });
  let { data, error } = await sb.from("contests").update(patch).eq("id", id).select("*").single();
  if (error && isMissingColumn(error) && "conditions" in patch) {
    // database not updated yet: save everything else and tell the admin
    delete patch.conditions;
    if (!Object.keys(patch).length) return json({ ok: true, contest: c, warning: "MIGRATION_NEEDED" });
    ({ data, error } = await sb.from("contests").update(patch).eq("id", id).select("*").single());
    if (!error) return json({ ok: true, contest: data, warning: "MIGRATION_NEEDED" });
  }
  if (error) return fail("DB_ERROR", 500, { message: error.message });
  return json({ ok: true, contest: data });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const denied = await guardAdmin();
  if (denied) return denied;
  const { id } = await ctx.params;
  const { error } = await supabaseAdmin().from("contests").delete().eq("id", id);
  if (error) return fail("DB_ERROR", 500);
  return json({ ok: true });
}
