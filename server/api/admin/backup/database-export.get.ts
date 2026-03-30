import { buildDatabaseExportPayload } from "~~/server/lib/admin-backup";
import { success } from "~~/server/utils/common";

export default defineEventHandler(async () => {
  const rc = useRuntimeConfig();
  const payload = await buildDatabaseExportPayload(
    String(rc.appVersion || process.env.NUXT_APP_VERSION || "")
  );
  return success(payload);
});
