import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
	appendMessage,
	createConversation,
	deleteConversation,
	getConversation,
	getConversationDetail,
	listConversations,
} from "./conversations";

async function withDataDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-web-conversations-"));
  const previous = process.env.AI_WEB_DATA_DIR;
  process.env.AI_WEB_DATA_DIR = dir;
  try {
    await run(dir);
  } finally {
    if (previous === undefined) delete process.env.AI_WEB_DATA_DIR;
    else process.env.AI_WEB_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
}

test("conversations are user-scoped, persisted and refreshable", async () => {
  await withDataDir(async () => {
    const first = await createConversation(7);
    await appendMessage(7, first.id, { id: "m1", role: "user", content: "你好" });
    await appendMessage(7, first.id, {
      id: "m2",
      role: "assistant",
      content: "你好！",
      requestId: "req-1",
      usage: { prompt: 10, completion: 5 },
    });
    const list = await listConversations(7);
    assert.equal(list.length, 1);
    assert.equal(list[0].messageCount, 2);
    assert.equal(list[0].title, "你好");

    const messages = await getConversation(7, first.id);
    assert.equal(messages.length, 2);
    assert.equal(messages[1].requestId, "req-1");
    assert.deepEqual(messages[1].usage, { prompt: 10, completion: 5 });

    // Another user cannot read the conversation.
    await assert.rejects(() => getConversation(8, first.id), /conversation not found/);
    await assert.rejects(() => appendMessage(8, first.id, { id: "x", role: "user", content: "hi" }), /conversation not found/);
  });
});

test("conversation store keeps only the latest messages", async () => {
  await withDataDir(async () => {
    const conversation = await createConversation(9);
    for (let index = 0; index < 210; index += 1) {
      await appendMessage(9, conversation.id, { id: `m${index}`, role: "user", content: `消息${index}` });
    }
    const messages = await getConversation(9, conversation.id);
    assert.equal(messages.length, 200);
    assert.equal(messages[0].content, "消息10");
    assert.equal(messages[messages.length - 1].content, "消息209");
  });
});

test("conversation store persists across reads on disk", async () => {
  await withDataDir(async (dir) => {
    const conversation = await createConversation(10);
    await appendMessage(10, conversation.id, { id: "m1", role: "user", content: "持久化" });
    const raw = await readFile(path.join(dir, "conversations", "10.json"), "utf8");
    assert.match(raw, /持久化/);
	});
});

test("conversation can be exported and deleted without affecting other users", async () => {
	await withDataDir(async () => {
		const conversation = await createConversation(11);
		await appendMessage(11, conversation.id, { id: "m1", role: "user", content: "导出内容" });
		const detail = await getConversationDetail(11, conversation.id);
		assert.equal(detail.title, "导出内容");
		assert.equal(detail.messages.length, 1);

		await deleteConversation(11, conversation.id);
		await assert.rejects(() => getConversation(11, conversation.id), /conversation not found/);
		await assert.rejects(() => deleteConversation(11, conversation.id), /conversation not found/);
		await assert.rejects(() => deleteConversation(12, conversation.id), /conversation not found/);
	});
});
