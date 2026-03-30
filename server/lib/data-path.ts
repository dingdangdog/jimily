import * as path from "path";

/** 与流水小票上传逻辑一致的数据目录（含 images 子目录） */
export function getServerDataPath(): string {
  const runtimeConfig = useRuntimeConfig();
  let dataPath = String(runtimeConfig.dataPath ?? "");
  if (!dataPath) {
    dataPath = process.cwd();
  }
  return dataPath;
}

export function getInvoiceImagesDir(): string {
  return path.join(getServerDataPath(), "images");
}
