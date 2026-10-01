import * as fs from "fs";
import * as path from "path";
import JSZip from "jszip";
import prisma from "~~/server/lib/prisma";
import { getInvoiceImagesDir } from "~~/server/lib/data-path";

export default defineEventHandler(async (event) => {
  const flows = await prisma.flow.findMany({
    select: { invoice: true },
  });
  const names = new Set<string>();
  for (const f of flows) {
    if (!f.invoice) continue;
    for (const part of f.invoice.split(",")) {
      const t = part.trim();
      if (t) names.add(path.basename(t));
    }
  }

  const dir = getInvoiceImagesDir();
  await fs.promises.mkdir(dir, { recursive: true });

  const zip = new JSZip();
  for (const name of names) {
    if (!/^[\w.\-]+$/.test(name)) continue;
    const full = path.join(dir, name);
    try {
      const st = await fs.promises.stat(full);
      if (!st.isFile()) continue;
      zip.file(name, await fs.promises.readFile(full));
    } catch {
      // 流水仍引用文件名但磁盘缺失时跳过
    }
  }

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  setResponseHeader(
    event,
    "Content-Type",
    "application/zip"
  );
  setResponseHeader(
    event,
    "Content-Disposition",
    `attachment; filename="jimily-invoices-${stamp}.zip"`
  );
  return buffer;
});
