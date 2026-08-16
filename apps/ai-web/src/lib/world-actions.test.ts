import assert from "node:assert/strict";
import test from "node:test";
import { ActionError } from "./action-http";
import { createWorld, deleteWorld, getWorld, listWorlds, updateWorld } from "./world-actions";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const world = {
  id: "w1",
  title: "燕川中学",
  description: "航天班日常",
  timeline: "2025 年",
  outline: "校园故事",
  createdAt: 1700000000,
  updatedAt: 1700000001,
};

test("listWorlds parses the world list", async () => {
  const result = await listWorlds(async () => json({ worlds: [world] }));
  assert.equal(result[0].id, "w1");
});

test("getWorld returns a world and maps 404", async () => {
  const result = await getWorld("w1", async () => json({ world }));
  assert.equal(result.title, "燕川中学");
  await assert.rejects(
    getWorld("missing", async () => json({ error: "不存在" }, 404)),
    (error: unknown) => error instanceof ActionError && error.code === "not_found",
  );
});

test("createWorld posts the input", async () => {
  let seenBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenBody = String(init?.body);
    return json({ world }, 201);
  };
  await createWorld(
    { title: "燕川中学", description: "航天班日常", timeline: "2025 年", outline: "校园故事" },
    fetcher,
  );
  assert.deepEqual(JSON.parse(seenBody), {
    title: "燕川中学",
    description: "航天班日常",
    timeline: "2025 年",
    outline: "校园故事",
  });
});

test("updateWorld sends PUT and returns the world", async () => {
  let seenUrl = "";
  let seenMethod = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenMethod = init?.method ?? "";
    return json({ world });
  };
  const result = await updateWorld("w1", { title: "燕川中学", description: "更新" }, fetcher);
  assert.equal(seenUrl, "/api/worlds/w1");
  assert.equal(seenMethod, "PUT");
  assert.equal(result.id, "w1");
});

test("deleteWorld sends DELETE", async () => {
  let seenUrl = "";
  let seenMethod = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenMethod = init?.method ?? "";
    return json({ success: true });
  };
  await deleteWorld("w1", fetcher);
  assert.equal(seenUrl, "/api/worlds/w1");
  assert.equal(seenMethod, "DELETE");
});
