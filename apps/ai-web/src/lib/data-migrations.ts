// 数据迁移与恢复门禁：dry-run、备份、校验和、版本迁移、失败回滚与报告。

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export type MigrationReport = {
  dryRun: boolean;
  backupDir: string | null;
  scanned: number;
  changed: number;
  checksums: { file: string; before: string; after: string }[];
  rolledBack: boolean;
};

type StoreRecord = Record<string, unknown>;

function isRecord(value: unknown): value is StoreRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function upgradeStore(kind: string, value: unknown): { changed: boolean; upgraded: unknown } {
  if (!isRecord(value)) throw new Error(`${kind} 存储格式不是对象。`);
  let changed = false;
  if (value.schemaVersion !== "1.0") {
    value.schemaVersion = "1.0";
    changed = true;
  }
  if (kind === "conversations" && Array.isArray(value.conversations)) {
    for (const conversation of value.conversations) {
      if (isRecord(conversation)) {
        if (conversation.schemaVersion !== "1.0") {
          conversation.schemaVersion = "1.0";
          changed = true;
        }
        if (Array.isArray(conversation.messages)) {
          for (const message of conversation.messages) {
            if (isRecord(message) && message.schemaVersion !== "1.0") {
              message.schemaVersion = "1.0";
              changed = true;
            }
          }
        }
      }
    }
  }
  return { changed, upgraded: value };
}

async function listStoreFiles(dataDir: string): Promise<string[]> {
  const files: string[] = [];
  let kinds: string[] = [];
  try {
    kinds = await readdir(dataDir, { withFileTypes: true }).then((entries) =>
      entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name),
    );
  } catch {
    return files;
  }
  for (const kind of kinds.sort()) {
    const kindDir = path.join(dataDir, kind);
    const names = (await readdir(kindDir).catch(() => [])).sort();
    for (const name of names) {
      if (name.endsWith(".json")) files.push(path.join(kindDir, name));
    }
  }
  return files;
}

async function restoreBackup(backupDir: string, files: string[]): Promise<void> {
  for (const file of files) {
    const relative = path.relative(path.dirname(path.dirname(file)), file);
    await cp(path.join(backupDir, relative), file, { force: true });
  }
}

export async function runDataMigrations(options: {
  dataDir: string;
  dryRun?: boolean;
  backupDir?: string;
}): Promise<MigrationReport> {
  const files = await listStoreFiles(options.dataDir);
  const report: MigrationReport = {
    dryRun: options.dryRun === true,
    backupDir: options.dryRun ? null : options.backupDir ?? null,
    scanned: files.length,
    changed: 0,
    checksums: [],
    rolledBack: false,
  };
  const backupDir = options.dryRun ? null : options.backupDir ?? null;
  const backedUp: string[] = [];
  try {
    for (const file of files) {
      const raw = await readFile(file, "utf8");
      const before = sha256(raw);
      const kind = path.basename(path.dirname(file));
      const parsed: unknown = JSON.parse(raw);
      const { changed, upgraded } = upgradeStore(kind, parsed);
      const after = sha256(JSON.stringify(upgraded, null, 2) + "\n");
      report.checksums.push({ file, before, after });
      if (!changed) continue;
      report.changed += 1;
      if (options.dryRun) continue;
      if (backupDir) {
        const relative = path.relative(path.dirname(path.dirname(file)), file);
        const target = path.join(backupDir, relative);
        await mkdir(path.dirname(target), { recursive: true });
        await cp(file, target, { force: true });
        backedUp.push(file);
      }
      const temporary = `${file}.migrate.tmp`;
      await writeFile(temporary, JSON.stringify(upgraded, null, 2) + "\n", "utf8");
      await rename(temporary, file);
    }
  } catch (error) {
    if (backupDir && backedUp.length > 0) {
      await restoreBackup(backupDir, backedUp);
      report.rolledBack = true;
    }
    throw error;
  }
  return report;
}
