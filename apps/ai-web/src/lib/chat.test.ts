import assert from "node:assert/strict";
import test from "node:test";
import { forwardChatCompletion, parseAiChatRequest } from "./chat";

test("chat request accepts only an allowed model and bounded text messages", () => {
  assert.deepEqual(
    parseAiChatRequest({ model: "deepseek-chat", messages: [{ role: "user", content: "hello" }] }, ["deepseek-chat"]),
    { model: "deepseek-chat", messages: [{ role: "user", content: "hello" }] },
  );
  assert.equal(parseAiChatRequest({ model: "gpt-4o", messages: [{ role: "user", content: "hello" }] }, ["deepseek-chat"]), null);
  assert.equal(parseAiChatRequest({ model: "deepseek-chat", messages: [{ role: "tool", content: "hello" }] }, ["deepseek-chat"]), null);
  assert.equal(parseAiChatRequest({ model: "deepseek-chat", messages: [{ role: "user", content: "x".repeat(16_001) }] }, ["deepseek-chat"]), null);
});

test("chat forwarding keeps the application key server-side and preserves SSE", async () => {
  let seenAuthorization = "";
  let seenBody = "";
  const fetcher: typeof fetch = async (_input, init) => {
    seenAuthorization = new Headers(init?.headers).get("authorization") ?? "";
    seenBody = String(init?.body);
    return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\n', {
      status: 200,
      headers: { "Content-Type": "text/event-stream", "X-Oneapi-Request-Id": "req-1" },
    });
  };
  const response = await forwardChatCompletion(
    new URL("https://api.example.test"),
    `sk-yc_${"a".repeat(64)}`,
    { model: "deepseek-chat", messages: [{ role: "user", content: "hello" }] },
    fetcher,
  );
  assert.equal(seenAuthorization, `Bearer sk-yc_${"a".repeat(64)}`);
  assert.deepEqual(JSON.parse(seenBody), { model: "deepseek-chat", messages: [{ role: "user", content: "hello" }], stream: true });
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  assert.equal(response.headers.get("x-request-id"), "req-1");
  assert.doesNotMatch(await response.text(), /sk-yc_/);
});

test("chat forwarding rejects a successful non-SSE response", async () => {
  const response = await forwardChatCompletion(
    new URL("https://api.example.test"),
    `sk-yc_${"a".repeat(64)}`,
    { model: "deepseek-chat", messages: [{ role: "user", content: "hello" }] },
    async () => Response.json({ choices: [] }),
  );
  assert.equal(response.status, 502);
  assert.match(await response.text(), /未返回流式响应/);
});
