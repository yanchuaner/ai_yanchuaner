import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { KnowledgeRepository } from "./knowledge-repository";
import { createFileKnowledgeRepository } from "./knowledge-file-repository";
import { createMemoryKnowledgeRepository } from "./knowledge-memory-repository";
import type { MemoryRepository } from "./memory-repository";
import { createFileMemoryRepository } from "./memory-file-repository";
import { createMemoryMemoryRepository } from "./memory-memory-repository";

async function withTempDir(run: () => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-km-repo-"));
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

const embedder = async () => [[1, 0, 0]];

async function runKnowledgeContract(repository: KnowledgeRepository) {
  const document = await repository.addText(
    7,
    null,
    { name: "我的资料", text: "燕中生态测试资料" },
    "BAAI/bge-m3",
    embedder,
  );
  const hits = await repository.search(7, null, [1, 0, 0], 4, 0.5);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].documentId, document.id);
  assert.equal((await repository.search(8, null, [1, 0, 0], 4, 0.5)).length, 0);
  await repository.deleteDocument(7, document.id);
  assert.equal((await repository.search(7, null, [1, 0, 0], 4, 0.5)).length, 0);

  await repository.addText(7, "persona_1", { name: "角色资料", text: "角色往事" }, "BAAI/bge-m3", embedder);
  assert.equal((await repository.search(7, "persona_1", [1, 0, 0], 4, 0.5)).length, 1);
  await repository.deleteScope(7, "persona_1");
  assert.equal((await repository.search(7, "persona_1", [1, 0, 0], 4, 0.5)).length, 0);
}

async function runMemoryContract(repository: MemoryRepository) {
  const saved = await repository.save(7, {
    personaId: "persona_1",
    summary: "记得生日",
    sourceConversationId: "conv_123456",
    messageCount: 20,
  });
  assert.equal(saved.summary, "记得生日");
  assert.equal((await repository.get(7, "persona_1"))?.summary, "记得生日");
  assert.equal(await repository.get(8, "persona_1"), null);
  await repository.clear(7, "persona_1");
  assert.equal(await repository.get(7, "persona_1"), null);
}

test("knowledge memory repository contract", async () => {
  await runKnowledgeContract(createMemoryKnowledgeRepository());
});

test("memory memory repository contract", async () => {
  await runMemoryContract(createMemoryMemoryRepository());
});

test("knowledge and memory file repositories run same contracts", async () => {
  await withTempDir(async () => {
    await runKnowledgeContract(createFileKnowledgeRepository());
    await runMemoryContract(createFileMemoryRepository());
  });
});
