import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import { getInvoiceImagesDir } from "~~/server/lib/data-path";
import { error, success } from "~~/server/utils/common";

function safeInvoiceFileName(zipPath: string): string | null {
  const base = path.basename(zipPath.replace(/\\/g, "/"));
  if (!base || base.includes("..")) return null;
  if (!/^[\w.\-]+$/.test(base)) return null;
  return base;
}

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event);
  const file = parts?.find((p) => p.name === "file" && p.filename);
  if (!file?.data?.length) {
    return error("请上传 zip 文件（字段名 file）");
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file.data);
  } catch {
    return error("无法解压，请确认文件为 zip 格式");
  }

  const dir = getInvoiceImagesDir();
  await fs.promises.mkdir(dir, { recursive: true });

  let written = 0;
  const entries = Object.keys(zip.files);
  for (const rel of entries) {
    const entry = zip.files[rel];
    if (!entry || entry.dir) continue;
    const safe = safeInvoiceFileName(rel);
    if (!safe) continue;
    const buf = await entry.async("nodebuffer");
    await fs.promises.writeFile(path.join(dir, safe), buf);
    written++;
  }

  return success({ ok: true, count: written });
});
