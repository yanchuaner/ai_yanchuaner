import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getPreferences, setFavoritePersonas } from "./preferences";

async function withDataDir(run: () => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-web-preferences-"));
  const previous = process.env.AI_WEB_DATA_DIR;
  process.env.AI_WEB_DATA_DIR = dir;
  try {
    await run();
  } finally {
    if (previous === undefined) delete process.env.AI_WEB_DATA_DIR;
    else process.env.AI_WEB_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

test("favorite personas are user-scoped and persisted", async () => {
  await withDataDir(async () => {
    assert.deepEqual((await getPreferences(7)).favoritePersonaIds, []);
    const saved = await setFavoritePersonas(7, ["preset-study-buddy", "preset-study-buddy", "custom-1"]);
    assert.deepEqual(saved.favoritePersonaIds, ["preset-study-buddy", "custom-1"]);
    assert.deepEqual((await getPreferences(7)).favoritePersonaIds, ["preset-study-buddy", "custom-1"]);
    assert.deepEqual((await getPreferences(8)).favoritePersonaIds, []);
    await assert.rejects(() => setFavoritePersonas(7, [""]), /favorites are invalid/);
    await assert.rejects(() => setFavoritePersonas(7, "preset-1"), /favorites are invalid/);
  });
});
