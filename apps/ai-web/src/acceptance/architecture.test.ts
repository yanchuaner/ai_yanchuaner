import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve("src");
const ALLOWED_FILES = new Set([
  "data-migrations.ts",
  "store.ts",
  "conversations.ts",
  "worlds.ts",
  "persona-library.ts",
  "preferences.ts",
  "knowledge-library.ts",
  "memory-library.ts",
  "media-settings.ts",
  "voice-settings.ts",
]);
const LEGACY_STORE_IMPORT = /^import \{[^}]*\} from "@\/lib\/(conversations|worlds|persona-library|preferences|knowledge-library|memory-library|media-settings|voice-settings)"/;

async function filesUnder(dir: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await filesUnder(full)));
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) result.push(full);
  }
  return result;
}

test("business code does not access filesystem storage directly", async () => {
  const dirs = ["app/api", "hooks", "workflows", "lib"].map((dir) => path.join(ROOT, dir));
  const files = (await Promise.all(dirs.map(filesUnder))).flat();
  const violations: string[] = [];
  for (const file of files) {
    if (ALLOWED_FILES.has(path.basename(file)) || /-(file|memory)-repository\.ts$/.test(file) || file.endsWith("-repository.ts")) continue;
    const raw = await readFile(file, "utf8");
    if (/node:fs|node:fs\/promises|from "@\/lib\/store"/.test(raw)) violations.push(file);
    if (LEGACY_STORE_IMPORT.test(raw)) violations.push(file);
  }
  assert.deepEqual(violations, []);
});
