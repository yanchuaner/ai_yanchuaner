import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ConversationRepository } from "./conversation-repository";
import { createFileConversationRepository } from "./conversation-file-repository";
import { createMemoryConversationRepository } from "./conversation-memory-repository";

async function withFileRepository(run: (repository: ConversationRepository) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-conv-repo-"));
  const previous = process.env.AI_WEB_DATA_DIR;
  process.env.AI_WEB_DATA_DIR = dir;
  try {
    await run(createFileConversationRepository());
  } finally {
    if (previous === undefined) delete process.env.AI_WEB_DATA_DIR;
    else process.env.AI_WEB_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

function runContractTests(label: string, create: () => ConversationRepository) {
  test(`${label}: create, list, detail and owner isolation`, async () => {
    const repository = create();
    const created = await repository.create(7);
    assert.equal(created.mode, "chat");
    const list = await repository.list(7);
    assert.equal(list.some((item) => item.id === created.id), true);
    assert.equal((await repository.list(8)).length, 0);
    const detail = await repository.getDetail(7, created.id);
    assert.equal(detail.mode, "chat");
    await assert.rejects(repository.getDetail(8, created.id), /conversation not found/);
  });

  test(`${label}: roleplay create keeps persona and append updates title`, async () => {
    const repository = create();
    const persona = { id: "persona_1", name: "闵先生", description: "班主任", firstMessage: "你好" };
    const created = await repository.create(7, { mode: "roleplay", persona });
    assert.equal(created.personaName, "闵先生");
    await repository.appendMessage(7, created.id, {
      id: "msg_123456",
      role: "user",
      content: "老师好",
    });
    const detail = await repository.getDetail(7, created.id);
    assert.equal(detail.messages.length, 1);
    assert.equal(detail.title, "闵先生");
  });

  test(`${label}: update, delete and not-found errors`, async () => {
    const repository = create();
    const created = await repository.create(7, { mode: "chat" });
    const updated = await repository.update(7, created.id, { title: "改标题", pinned: true });
    assert.equal(updated.title, "改标题");
    assert.equal(updated.pinned, true);
    await repository.delete(7, created.id);
    await assert.rejects(repository.getDetail(7, created.id), /conversation not found/);
  });
}

runContractTests("memory repository", createMemoryConversationRepository);

test("file repository reads legacy JSON without schemaVersion and writes back", async () => {
  await withFileRepository(async (repository) => {
    const storeDir = path.join(process.env.AI_WEB_DATA_DIR!, "conversations");
    await mkdir(storeDir, { recursive: true });
    const legacy = {
      conversations: [
        {
          id: "legacy_123456",
          title: "旧会话",
          createdAt: 1700000000000,
          updatedAt: 1700000001000,
          mode: "chat",
          messages: [
            { id: "msg_123456", role: "user", content: "旧消息" },
          ],
        },
      ],
    };
    await writeFile(path.join(storeDir, "7.json"), JSON.stringify(legacy));
    const list = await repository.list(7);
    assert.equal(list.length, 1);
    assert.equal(list[0].title, "旧会话");
    const detail = await repository.getDetail(7, "legacy_123456");
    assert.equal(detail.messages[0].content, "旧消息");
    await repository.appendMessage(7, "legacy_123456", {
      id: "msg_123457",
      role: "assistant",
      content: "新回复",
    });
    const after = await repository.getDetail(7, "legacy_123456");
    assert.equal(after.messages.length, 2);
  });
});
