import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { PersonaRepository } from "./persona-repository";
import { createFilePersonaRepository } from "./persona-file-repository";
import { createMemoryPersonaRepository } from "./persona-memory-repository";
import type { WorldRepository } from "./world-repository";
import { createFileWorldRepository } from "./world-file-repository";
import { createMemoryWorldRepository } from "./world-memory-repository";
import type { PreferencesRepository } from "./preferences-repository";
import { createFilePreferencesRepository } from "./preferences-file-repository";
import { createMemoryPreferencesRepository } from "./preferences-memory-repository";
import type { ByokSettingsRepository } from "./byok-settings-repository";
import { createFileByokSettingsRepository } from "./byok-settings-file-repository";
import { createMemoryByokSettingsRepository } from "./byok-settings-memory-repository";

async function withTempDir(run: () => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-repo-"));
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

async function runPersonaContract(repository: PersonaRepository) {
  const input = { name: "闵先生", description: "班主任", firstMessage: "你好" };
  const created = await repository.create(7, input);
  assert.equal(created.name, "闵先生");
  assert.equal((await repository.list(8)).length, 0);
  const updated = await repository.update(7, created.id, { ...input, description: "新设定" });
  assert.equal(updated.description, "新设定");
  await repository.delete(7, created.id);
  assert.equal((await repository.list(7)).length, 0);
  await assert.rejects(repository.delete(7, created.id), /persona not found/);
}

async function runWorldContract(repository: WorldRepository) {
  const created = await repository.create(7, { title: "燕川中学", description: "校园" });
  assert.equal(await repository.get(8, created.id), null);
  const updated = await repository.update(7, created.id, { title: "燕川中学", description: "更新" });
  assert.equal(updated.description, "更新");
  await repository.delete(7, created.id);
  assert.equal(await repository.get(7, created.id), null);
}

async function runPreferencesContract(repository: PreferencesRepository) {
  await repository.setFavorites(7, ["persona_1", "persona_2"]);
  assert.deepEqual((await repository.get(7)).favoritePersonaIds, ["persona_1", "persona_2"]);
  assert.deepEqual((await repository.get(8)).favoritePersonaIds, []);
}

async function runByokContract(repository: ByokSettingsRepository) {
  const media = await repository.updateMedia(7, {
    baseUrl: "https://api.example.test/v1",
    visionModel: "qwen-vl",
    imageModel: "flux",
    apiKey: "sk-test",
  });
  assert.equal(media?.visionModel, "qwen-vl");
  await repository.clearMedia(7);
  assert.equal(await repository.getMedia(7), null);

  await repository.updateVoice(7, {
    asr: { baseUrl: "https://api.example.test/v1", model: "sensevoice", apiKey: "sk-test" },
  });
  assert.equal((await repository.getVoice(7)).asr?.model, "sensevoice");
  await repository.clearVoiceSection(7, "asr");
  assert.equal((await repository.getVoice(7)).asr, null);
}

test("persona memory repository contract", async () => {
  await runPersonaContract(createMemoryPersonaRepository());
});

test("world memory repository contract", async () => {
  await runWorldContract(createMemoryWorldRepository());
});

test("preferences memory repository contract", async () => {
  await runPreferencesContract(createMemoryPreferencesRepository());
});

test("byok memory repository contract", async () => {
  await runByokContract(createMemoryByokSettingsRepository());
});

test("file repositories run same contracts against JSON storage", async () => {
  await withTempDir(async () => {
    await runPersonaContract(createFilePersonaRepository());
    await runWorldContract(createFileWorldRepository());
    await runPreferencesContract(createFilePreferencesRepository());
    await runByokContract(createFileByokSettingsRepository("01234567890123456789012345678901", false));
  });
});
