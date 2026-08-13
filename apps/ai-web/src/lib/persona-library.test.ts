import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPersona, deletePersona, listPersonas } from "./persona-library";

async function withDataDir(run: (dir: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-web-personas-"));
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

const validInput = {
  name: "星河向导",
  description: "一位熟悉星图的老向导。",
  firstMessage: "欢迎登舰。",
  tags: ["科幻"],
};

test("personas are user-scoped, persisted and deletable", async () => {
  await withDataDir(async () => {
    const created = await createPersona(7, validInput);
    assert.match(created.id, /^custom-/);
    assert.equal(created.name, "星河向导");

    const ownList = await listPersonas(7);
    assert.equal(ownList.length, 1);
    assert.deepEqual(ownList[0], created);
    assert.equal((await listPersonas(8)).length, 0);

    await assert.rejects(() => createPersona(7, { ...validInput, name: "" }), /input is invalid/);
    await assert.rejects(() => createPersona(7, { name: 42, description: "", firstMessage: "" }), /input is invalid/);
    await assert.rejects(() => deletePersona(8, created.id), /not found/);

    await deletePersona(7, created.id);
    assert.equal((await listPersonas(7)).length, 0);
    await assert.rejects(() => deletePersona(7, created.id), /not found/);
  });
});
