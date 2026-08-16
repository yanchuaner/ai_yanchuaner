import assert from "node:assert/strict";
import test from "node:test";
import {
  appendConversationMessage,
  clearConversationMemory,
  ConversationActionError,
  createConversation,
  deleteConversation,
  exportConversation,
  getConversationDetail,
  getConversationMemory,
  listConversations,
  refreshConversationMemory,
  updateConversation,
} from "./conversation-actions";

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const summary = {
  id: "c1",
  title: "新对话",
  updatedAt: 1700000000,
  messageCount: 2,
  mode: "chat",
  pinned: false,
  archived: false,
};

test("createConversation posts the input and returns a summary", async () => {
  let seenUrl = "";
  let seenBody = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenBody = String(init?.body);
    return json({ conversation: summary });
  };
  const result = await createConversation({ mode: "chat" }, fetcher);
  assert.equal(seenUrl, "/api/chat/conversations");
  assert.deepEqual(JSON.parse(seenBody), { mode: "chat" });
  assert.equal(result.id, "c1");
});

test("listConversations parses summaries and maps 401", async () => {
  const result = await listConversations(async () => json({ conversations: [summary] }));
  assert.equal(result[0].id, "c1");
  await assert.rejects(
    listConversations(async () => json({ error: "x" }, 401)),
    (error: unknown) => error instanceof ConversationActionError && error.code === "unauthenticated",
  );
});

test("getConversationDetail parses messages and conversation metadata", async () => {
  const detail = await getConversationDetail(
    "c1",
    async () =>
      json({
        id: "c1",
        title: "角色对话",
        updatedAt: 1700000001,
        mode: "roleplay",
        persona: { id: "p1", name: "闵先生" },
        messages: [
          { id: "m1", role: "user", content: "你好" },
          { id: "m2", role: "assistant", content: "你好", requestId: "req-1", usage: { prompt: 10, completion: 5 } },
        ],
      }),
  );
  assert.equal(detail.mode, "roleplay");
  assert.equal(detail.persona?.id, "p1");
  assert.equal(detail.messages[1].requestId, "req-1");
  assert.deepEqual(detail.messages[1].usage, { prompt: 10, completion: 5 });
});

test("updateConversation sends PUT and returns the updated summary", async () => {
  let seenUrl = "";
  let seenBody = "";
  let seenMethod = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenBody = String(init?.body);
    seenMethod = init?.method ?? "";
    return json({ conversation: { ...summary, title: "改标题" } });
  };
  const result = await updateConversation("c1", { title: "改标题", pinned: true }, fetcher);
  assert.equal(seenUrl, "/api/chat/conversations/c1");
  assert.equal(seenMethod, "PUT");
  assert.deepEqual(JSON.parse(seenBody), { title: "改标题", pinned: true });
  assert.equal(result.title, "改标题");
});

test("deleteConversation sends DELETE", async () => {
  let seenUrl = "";
  let seenMethod = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenMethod = init?.method ?? "";
    return json({ success: true });
  };
  await deleteConversation("c1", fetcher);
  assert.equal(seenUrl, "/api/chat/conversations/c1");
  assert.equal(seenMethod, "DELETE");
});

test("exportConversation returns text and filename", async () => {
  const result = await exportConversation(
    "c1",
    async () =>
      new Response('{"id":"c1"}', {
        headers: {
          "content-type": "application/json",
          "content-disposition": 'attachment; filename="yanchuaner-ai-conversation-c1.json"',
        },
      }),
  );
  assert.equal(result.text, '{"id":"c1"}');
  assert.equal(result.filename, "yanchuaner-ai-conversation-c1.json");
});

test("appendConversationMessage posts the message body", async () => {
  let seenUrl = "";
  let seenBody = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenBody = String(init?.body);
    return json({ conversation: summary });
  };
  await appendConversationMessage(
    "c1",
    { id: "m1", role: "user", content: "你好", traceId: "t1", requestId: "r1" },
    fetcher,
  );
  assert.equal(seenUrl, "/api/chat/conversations/c1/messages");
  assert.deepEqual(JSON.parse(seenBody), { id: "m1", role: "user", content: "你好", traceId: "t1", requestId: "r1" });
});

test("memory actions read, refresh and clear", async () => {
  const memory = await getConversationMemory(
    "c1",
    async () => json({ memory: { summary: "摘要" } }),
  );
  assert.equal(memory.summary, "摘要");
  const refreshed = await refreshConversationMemory(
    "c1",
    async () => json({ updated: true, memory: { summary: "新摘要" } }),
  );
  assert.equal(refreshed.updated, true);
  assert.equal(refreshed.summary, "新摘要");
  let seenMethod = "";
  await clearConversationMemory("c1", async (_input, init) => {
    seenMethod = init?.method ?? "";
    return json({ success: true });
  });
  assert.equal(seenMethod, "DELETE");
});
