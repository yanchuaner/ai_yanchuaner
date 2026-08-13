import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  appendMessage,
  createConversation,
  getConversationDetail,
} from "@/lib/conversations";
import { listConversationMemories, updateConversationMemories } from "./memory-handler";

const apiBaseUrl = new URL("https://api.example.test");
const accessKey = `sk-yc_${"a".repeat(64)}`;

async function withDataDir(run: () => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-web-memory-handler-"));
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

test("group memory generates a separate summary for each member", async () => {
  await withDataDir(async () => {
    const traveler = {
      id: "preset-star-traveler",
      name: "星河旅者",
      description: "星海旅者",
      firstMessage: "欢迎",
    };
    const buddy = {
      id: "preset-study-buddy",
      name: "燕中学伴",
      description: "校园伙伴",
      firstMessage: "嗨",
    };
    const conversation = await createConversation(7, { mode: "group", cast: [traveler, buddy] });
    for (let index = 0; index < 16; index += 1) {
      const isUser = index % 2 === 0;
      await appendMessage(7, conversation.id, {
        id: `m${index}`,
        role: isUser ? "user" : "assistant",
        content: isUser ? `问题${index}` : `回答${index}`,
        personaId: isUser ? undefined : index % 4 === 1 ? traveler.id : buddy.id,
      });
    }
    const detail = await getConversationDetail(7, conversation.id);
    const fetcher: typeof fetch = async (_input, init) => {
      const parsed = JSON.parse(String(init?.body)) as {
        messages: { role: string; content: string }[];
      };
      const system = parsed.messages[0].content;
      const summary = system.includes("星河旅者") ? "旅者记得星海见闻。" : "学伴记得校园趣事。";
      return Response.json({ choices: [{ message: { content: summary } }] });
    };

    const first = await updateConversationMemories(
      apiBaseUrl,
      accessKey,
      "deepseek-chat",
      7,
      detail,
      fetcher,
    );
    assert.equal(first.updated, true);
    assert.equal(first.memories.length, 2);
    assert.deepEqual(
      new Set(first.memories.map((item) => item.personaId)),
      new Set([traveler.id, buddy.id]),
    );
    assert.ok(first.memories.some((item) => item.memory?.summary.includes("旅者记得")));
    assert.ok(first.memories.some((item) => item.memory?.summary.includes("学伴记得")));

    const again = await updateConversationMemories(
      apiBaseUrl,
      accessKey,
      "deepseek-chat",
      7,
      detail,
      fetcher,
    );
    assert.equal(again.updated, false);

    const listed = await listConversationMemories(7, detail);
    assert.equal(listed.length, 2);
    assert.ok(listed.every((item) => item.memory?.summary));
  });
});

test("roleplay memory still updates as a single persona", async () => {
  await withDataDir(async () => {
    const persona = {
      id: "preset-elder",
      name: "长者",
      description: "温和的长者",
      firstMessage: "开始",
    };
    const conversation = await createConversation(7, { mode: "roleplay", persona });
    for (let index = 0; index < 16; index += 1) {
      await appendMessage(7, conversation.id, {
        id: `m${index}`,
        role: index % 2 === 0 ? "user" : "assistant",
        content: `消息${index}`,
        personaId: index % 2 === 0 ? undefined : persona.id,
      });
    }
    const detail = await getConversationDetail(7, conversation.id);
    const fetcher: typeof fetch = async (_input, init) => {
      const parsed = JSON.parse(String(init?.body)) as {
        messages: { role: string; content: string }[];
      };
      assert.match(parsed.messages[0].content, /以「长者」的视角/);
      return Response.json({ choices: [{ message: { content: "长者记得这些往事。" } }] });
    };
    const result = await updateConversationMemories(
      apiBaseUrl,
      accessKey,
      "deepseek-chat",
      7,
      detail,
      fetcher,
    );
    assert.equal(result.updated, true);
    assert.equal(result.memories.length, 1);
    assert.equal(result.memories[0].memory?.summary, "长者记得这些往事。");
  });
});
