import { doApi } from "~/utils/api";

const prefix = "api/admin/backup";

export const fetchDatabaseBackupPayload = () => {
  return doApi.get<Record<string, unknown>>(prefix + "/database-export");
};

export const importDatabaseBackupFile = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return doApi.postform<{ ok: boolean }>(prefix + "/database-import", fd);
};

export const downloadInvoicesZipBlob = () => {
  return doApi.download(prefix + "/invoices-export");
};

export const importInvoicesZipFile = (file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return doApi.postform<{ ok: boolean; count: number }>(
    prefix + "/invoices-import",
    fd
  );
};
