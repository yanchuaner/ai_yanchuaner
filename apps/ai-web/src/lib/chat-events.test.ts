import assert from "node:assert/strict";
import test from "node:test";
import { ChatStreamError, parseChatChunk, readChatStream } from "./chat-events";

test("parseChatChunk maps delta, usage, error, done and malformed payloads", () => {
  assert.deepEqual(parseChatChunk('{"choices":[{"delta":{"content":"你好"}}]}'), {
    type: "delta",
    content: "你好",
  });
  assert.deepEqual(parseChatChunk('{"usage":{"prompt_tokens":10,"completion_tokens":5}}'), {
    type: "usage",
    usage: { prompt: 10, completion: 5 },
  });
  assert.deepEqual(parseChatChunk('{"error":{"message":"上游失败"}}'), {
    type: "error",
    message: "上游失败",
  });
  assert.deepEqual(parseChatChunk("[DONE]"), { type: "done" });
  assert.deepEqual(parseChatChunk("not-json"), { type: "unknown" });
  assert.deepEqual(parseChatChunk(""), { type: "unknown" });
});

test("readChatStream accumulates content and usage across chunk boundaries", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"你"}}]}\n\ndata: {"choices":[{"de'));
      controller.enqueue(encoder.encode('lta":{"content":"好"}}]}\n\ndata: {"usage":{"prompt_tokens":3,"completion_tokens":2}}\n\ndata: [DONE]\n\n'));
      controller.close();
    },
  });
  let rendered = "";
  const result = await readChatStream(new Response(stream), {
    onDelta: (content) => {
      rendered += content;
    },
  });
  assert.equal(rendered, "你好");
  assert.equal(result.content, "你好");
  assert.deepEqual(result.usage, { prompt: 3, completion: 2 });
});

test("readChatStream throws when the stream contains an error event", async () => {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('data: {"error":{"message":"额度不足"}}\n\n'));
      controller.close();
    },
  });
  await assert.rejects(
    readChatStream(new Response(stream), { onDelta: () => {} }),
    (error: unknown) => error instanceof ChatStreamError && error.message === "额度不足",
  );
});

test("readChatStream rejects a response without a body", async () => {
  await assert.rejects(
    readChatStream(new Response(null, { status: 200 }), { onDelta: () => {} }),
    (error: unknown) => error instanceof ChatStreamError,
  );
});
