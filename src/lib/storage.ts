import { supabaseAdmin } from "@/lib/supabase/server";
import { STORAGE_BUCKET } from "@/lib/env";

let bucketReady = false;

export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const sb = supabaseAdmin();
  const { data } = await sb.storage.getBucket(STORAGE_BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(STORAGE_BUCKET, { public: true });
    if (error && !/exist/i.test(error.message)) throw error;
  }
  bucketReady = true;
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

// Vercel functions accept request bodies up to 4.5 MB
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export function extFor(contentType: string): string | null {
  return EXT[contentType.split(";")[0].trim().toLowerCase()] ?? null;
}

export async function uploadImage(path: string, body: ArrayBuffer | Uint8Array, contentType: string): Promise<string> {
  await ensureBucket();
  const sb = supabaseAdmin();
  const { error } = await sb.storage.from(STORAGE_BUCKET).upload(path, body, {
    contentType,
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw error;
  const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Downloads a remote avatar (TikTok CDN links expire) and stores a permanent copy. */
export async function mirrorAvatar(streamerId: string, remoteUrl: string | null): Promise<string | null> {
  if (!remoteUrl || !/^https?:\/\//.test(remoteUrl)) return null;
  try {
    const res = await fetch(remoteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(7000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    const ext = extFor(type);
    if (!ext || ext === "svg") return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 100 || buf.byteLength > MAX_UPLOAD_BYTES) return null;
    return await uploadImage(`avatars/${streamerId}.${ext}`, buf, type);
  } catch {
    return null;
  }
}
