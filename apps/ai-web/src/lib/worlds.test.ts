import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWorld, deleteWorld, getWorld, listWorlds, updateWorld } from "./worlds";

async function withDataDir(run: () => Promise<void>) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-web-worlds-"));
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

test("worlds are isolated per user and support create/read/update/delete", async () => {
  await withDataDir(async () => {
    const world = await createWorld(7, {
      title: "燕川中学",
      description: "临海的寄宿制中学。",
      timeline: "高三上学期",
      outline: "日常校园生活。",
      tags: ["校园"],
    });
    assert.equal(world.title, "燕川中学");
    assert.equal((await listWorlds(7)).length, 1);
    assert.deepEqual(await getWorld(7, world.id), world);
    assert.equal(await getWorld(8, world.id), null);

    const updated = await updateWorld(7, world.id, {
      title: "燕川中学（新校区）",
      description: "临海的寄宿制中学。",
      outline: "加入了新校区剧情。",
    });
    assert.equal(updated.title, "燕川中学（新校区）");
    assert.equal(updated.outline, "加入了新校区剧情。");

    await deleteWorld(7, world.id);
    assert.equal((await listWorlds(7)).length, 0);
    await assert.rejects(() => deleteWorld(7, world.id), /world not found/);
  });
});

test("invalid world input is rejected", async () => {
  await withDataDir(async () => {
    await assert.rejects(
      () =>
        createWorld(7, {
          title: "",
          description: "内容",
        }),
      /world is invalid/,
    );
    await assert.rejects(
      () =>
        createWorld(7, {
          title: "标题",
          description: "内容",
          outline: "x".repeat(12001),
        }),
      /world is invalid/,
    );
  });
});
