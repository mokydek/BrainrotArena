"use client";

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string; message?: string };

export async function api<T = Record<string, unknown>>(
  url: string,
  opts: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
      headers: opts.body ? { "Content-Type": "application/json" } : undefined,
      body: opts.form ?? (opts.body ? JSON.stringify(opts.body) : undefined),
      credentials: "same-origin",
      cache: "no-store",
    });
    if (res.status === 413) return { ok: false, error: "FILE_TOO_BIG" };
    const data = await res.json().catch(() => null);
    if (!data) return { ok: false, error: "error" };
    if (!res.ok && data.ok !== false) return { ok: false, error: "error" };
    return data;
  } catch {
    return { ok: false, error: "error" };
  }
}

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_SIDE = 1200;

/** Downscales big photos in the browser (keeps GIF animations untouched). */
async function shrink(file: File): Promise<File> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= 1.5 * 1024 * 1024) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/webp", 0.9));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

export async function uploadFile(file: File, folder: "brainrots" | "avatars" = "brainrots"): Promise<ApiResult<{ url: string }>> {
  if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return { ok: false, error: "BAD_FILE_TYPE" };
  const f = await shrink(file);
  if (f.size > MAX_BYTES) return { ok: false, error: "FILE_TOO_BIG" };
  const form = new FormData();
  form.append("file", f);
  form.append("folder", folder);
  return api<{ url: string }>("/api/upload", { form });
}
