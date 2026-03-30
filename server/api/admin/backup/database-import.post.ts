import { importDatabaseFromPayload } from "~~/server/lib/admin-backup";
import { error, success } from "~~/server/utils/common";

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event);
  const file = parts?.find((p) => p.name === "file" && p.filename);
  if (!file?.data?.length) {
    return error("请上传有效的 JSON 备份文件（字段名 file）");
  }

  let raw: unknown;
  try {
    const text = file.data.toString("utf-8");
    raw = JSON.parse(text);
  } catch {
    return error("无法解析 JSON，请确认文件为本系统导出的备份");
  }

  try {
    await importDatabaseFromPayload(raw);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[admin backup import]", e);
    return error("导入失败：" + msg);
  }

  return success({ ok: true });
});
