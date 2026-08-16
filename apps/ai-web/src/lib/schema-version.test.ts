import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { appendMessage, createConversation, getConversationDetail } from "@/lib/conversations";

async function withDataDir(run: () => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-web-schema-"));
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

test("new messages are persisted with schemaVersion 1.0", async () => {
  await withDataDir(async () => {
    const conversation = await createConversation(7, {});
    await appendMessage(7, conversation.id, {
      id: "m1",
      role: "user",
      content: "你好",
    });
    const detail = await getConversationDetail(7, conversation.id);
    assert.equal(detail.messages[0].schemaVersion, "1.0");
  });
});

test("messages with unsupported schemaVersion are rejected", async () => {
  await withDataDir(async () => {
    const conversation = await createConversation(7, {});
    await assert.rejects(
      appendMessage(
        7,
        conversation.id,
        {
          schemaVersion: "0.9",
          id: "m-bad",
          role: "user",
          content: "旧版本",
        } as never,
      ),
      /message is invalid/,
    );
  });
});
