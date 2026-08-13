import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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
	updateConversation,
} from "./conversations";
import { PRESET_PERSONAS } from "./personas";

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

test("roleplay conversations persist mode and persona snapshot", async () => {
	await withDataDir(async () => {
		const persona = PRESET_PERSONAS[0];
		const conversation = await createConversation(7, { mode: "roleplay", persona });
		assert.equal(conversation.mode, "roleplay");
		assert.equal(conversation.personaName, persona.name);

		const detail = await getConversationDetail(7, conversation.id);
		assert.equal(detail.mode, "roleplay");
		assert.deepEqual(detail.persona, persona);

		await assert.rejects(() => createConversation(7, { mode: "roleplay" }), /persona is invalid/);
		await assert.rejects(
			() => createConversation(7, { mode: "roleplay", persona: { ...persona, name: "" } }),
			/persona is invalid/,
		);

		const plain = await createConversation(7);
		assert.equal(plain.mode, "chat");
		assert.equal(plain.personaName, undefined);
		const plainDetail = await getConversationDetail(7, plain.id);
		assert.equal(plainDetail.persona, undefined);
	});
});

test("old conversations without a mode are read as plain chat", async () => {
	await withDataDir(async (dir) => {
		const conversation = await createConversation(12);
		await appendMessage(12, conversation.id, { id: "m1", role: "user", content: "旧数据" });
		const file = path.join(dir, "conversations", "12.json");
		const raw = JSON.parse(await readFile(file, "utf8"));
		for (const item of raw.conversations) {
			delete item.mode;
		}
		await writeFile(file, JSON.stringify(raw));

		const detail = await getConversationDetail(12, conversation.id);
		assert.equal(detail.mode, "chat");
		assert.equal(detail.messages.length, 1);
	});
});

test("conversations can be renamed, pinned, archived and filtered by persona", async () => {
	await withDataDir(async () => {
		const persona = PRESET_PERSONAS[1];
		const roleplay = await createConversation(13, { mode: "roleplay", persona });
		const plain = await createConversation(13);
		await appendMessage(13, plain.id, { id: "m1", role: "user", content: "随便聊聊" });

		const renamed = await updateConversation(13, plain.id, { title: "改名后的会话" });
		assert.equal(renamed.title, "改名后的会话");

		const pinned = await updateConversation(13, plain.id, { pinned: true });
		assert.equal(pinned.pinned, true);
		const archived = await updateConversation(13, roleplay.id, { archived: true });
		assert.equal(archived.archived, true);

		const list = await listConversations(13);
		assert.equal(list[0].id, plain.id, "置顶会话排在最前");
		const roleplaySummary = list.find((item) => item.id === roleplay.id);
		assert.equal(roleplaySummary?.personaId, persona.id);
		assert.equal(roleplaySummary?.archived, true);

		await assert.rejects(() => updateConversation(13, plain.id, { title: "" }), /title is invalid/);
		await assert.rejects(() => updateConversation(13, "missing", { pinned: true }), /not found/);
		await assert.rejects(() => updateConversation(14, plain.id, { pinned: true }), /not found/);
	});
});
