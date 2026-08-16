import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendMessage, createConversation, getConversationDetail } from "@/lib/conversations";
import { createPersona, listPersonas } from "@/lib/persona-library";

async function withDataDir(run: () => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-web-store-race-"));
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

test("concurrent message appends keep every message", async () => {
  await withDataDir(async () => {
    const conversation = await createConversation(7, {});
    const ids = Array.from({ length: 30 }, (_, index) => `msg-${index}`);
    await Promise.all(
      ids.map((id) =>
        appendMessage(7, conversation.id, { id, role: "user", content: `内容 ${id}` }),
      ),
    );
    const detail = await getConversationDetail(7, conversation.id);
    const saved = new Set(detail.messages.map((message) => message.id));
    assert.equal(detail.messages.length, ids.length);
    for (const id of ids) assert.ok(saved.has(id), `丢失更新：${id}`);
  });
});

test("concurrent persona creates keep every persona", async () => {
  await withDataDir(async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        createPersona(7, {
          name: `角色 ${index}`,
          description: `描述 ${index}`,
          firstMessage: "",
        }),
      ),
    );
    const personas = await listPersonas(7);
    assert.equal(personas.length, 20);
  });
});
