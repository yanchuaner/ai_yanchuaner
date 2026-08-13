// 用户级 JSON 存储的公共读写工具。
// 会话与角色库共用同一套原子写入方式，后续新增按用户存储的数据时直接复用。

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export function userStorePath(kind: string, userId: number): string {
  const dataDir = process.env.AI_WEB_DATA_DIR?.trim() || "/data";
  return path.join(dataDir, kind, `${userId}.json`);
}

export async function readJsonFile<T>(file: string, fallback: T, isValid: (value: unknown) => value is T): Promise<T> {
  try {
    const raw = await readFile(file, "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (!isValid(parsed)) throw new Error("store is invalid");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw error;
  }
}

export async function writeJsonFile(file: string, value: unknown, maxBytes: number): Promise<void> {
  const directory = path.dirname(file);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const raw = JSON.stringify(value);
  if (Buffer.byteLength(raw, "utf8") > maxBytes) throw new Error("store is too large");
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, raw, { mode: 0o600, encoding: "utf8" });
  await rename(temporary, file);
}
