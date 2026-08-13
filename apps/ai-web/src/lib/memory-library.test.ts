import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  clearPersonaMemory,
  getPersonaMemory,
  listPersonaMemories,
  savePersonaMemory,
} from "./memory-library";

async function withDataDir(run: () => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-web-memory-"));
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

test("persona memory is user-scoped, updatable and clearable", async () => {
  await withDataDir(async () => {
    assert.equal(await getPersonaMemory(7, "persona-a"), null);
    const first = await savePersonaMemory(7, {
      personaId: "persona-a",
      summary: "角色 A 记住了用户的生日。",
      sourceConversationId: "conv-1",
      messageCount: 30,
    });
    assert.equal(first.summary, "角色 A 记住了用户的生日。");
    const second = await savePersonaMemory(7, {
      personaId: "persona-a",
      summary: "角色 A 记住了用户的生日，也知道了他的学校。",
      sourceConversationId: "conv-2",
      messageCount: 60,
    });
    assert.match(second.summary, /学校/);
    assert.equal((await getPersonaMemory(7, "persona-a"))?.messageCount, 60);
    assert.equal(await getPersonaMemory(8, "persona-a"), null);
    assert.equal((await listPersonaMemories(7)).length, 1);

    await clearPersonaMemory(7, "persona-a");
    assert.equal(await getPersonaMemory(7, "persona-a"), null);
    await assert.rejects(
      () =>
        savePersonaMemory(7, {
          personaId: "p",
          summary: "",
          sourceConversationId: "c",
          messageCount: 1,
        }),
      /summary is invalid/,
    );
  });
});
