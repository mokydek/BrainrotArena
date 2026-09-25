import { randomUUID } from "node:crypto";
import { fail, guardAdmin, json } from "@/lib/http";
import { MAX_UPLOAD_BYTES, extFor, uploadImage } from "@/lib/storage";

export const maxDuration = 30;

/** Admin: multipart upload of a brainrot / avatar image -> public URL. */
export async function POST(req: Request) {
  const denied = await guardAdmin();
  if (denied) return denied;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("BAD_REQUEST");
  }
  const file = form.get("file");
  if (!file || typeof file === "string") return fail("NO_FILE");
  const ext = extFor(file.type);
  if (!ext) return fail("BAD_FILE_TYPE");
  if (file.size > MAX_UPLOAD_BYTES) return fail("FILE_TOO_BIG");

  const folder = form.get("folder") === "avatars" ? "custom-avatars" : "brainrots";
  try {
    const url = await uploadImage(`${folder}/${randomUUID()}.${ext}`, await file.arrayBuffer(), file.type);
    return json({ ok: true, url });
  } catch (e) {
    return fail("UPLOAD_FAILED", 500, { message: e instanceof Error ? e.message : String(e) });
  }
}
