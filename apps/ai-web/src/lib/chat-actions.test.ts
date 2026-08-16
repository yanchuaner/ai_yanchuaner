import assert from "node:assert/strict";
import test from "node:test";
import { ChatActionError, requestGroupSchedule, streamChatCompletion } from "./chat-actions";

const input = {
  model: "deepseek-v4-flash",
  messages: [{ role: "user" as const, content: "你好" }],
  conversationId: "c1",
  clientRequestId: "client-1",
  traceId: "trace-1",
};

function sseResponse(chunks: string[], headers?: HeadersInit) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "x-request-id": "req-1",
      ...headers,
    },
  });
}

test("streamChatCompletion posts ids and returns parsed stream result", async () => {
  let seenUrl = "";
  let seenClientRequestId = "";
  let seenTraceId = "";
  let seenBody = "";
  const fetcher: typeof fetch = async (url, init) => {
    seenUrl = String(url);
    const headers = new Headers(init?.headers);
    seenClientRequestId = headers.get("x-client-request-id") ?? "";
    seenTraceId = headers.get("x-trace-id") ?? "";
    seenBody = String(init?.body);
    return sseResponse([
      'data: {"choices":[{"delta":{"content":"你"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"好"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\n',
      "data: [DONE]\n\n",
    ]);
  };
  let rendered = "";
  const result = await streamChatCompletion(
    input,
    {
      onDelta: (content) => {
        rendered += content;
      },
    },
    fetcher,
  );
  assert.equal(seenUrl, "/api/chat/completions");
  assert.equal(seenClientRequestId, "client-1");
  assert.equal(seenTraceId, "trace-1");
  assert.deepEqual(JSON.parse(seenBody), {
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "你好" }],
    conversationId: "c1",
  });
  assert.equal(rendered, "你好");
  assert.equal(result.requestId, "req-1");
  assert.equal(result.content, "你好");
  assert.deepEqual(result.usage, { prompt: 2, completion: 1 });
});

for (const [status, code] of [
  [401, "unauthenticated"],
  [429, "rate_limited"],
  [502, "unavailable"],
  [400, "invalid"],
] as const) {
  test(`streamChatCompletion maps HTTP ${status} to ${code}`, async () => {
    await assert.rejects(
      streamChatCompletion(
        input,
        { onDelta: () => {} },
        async () => Response.json({ error: "失败" }, { status }),
      ),
      (error: unknown) => error instanceof ChatActionError && error.code === code && error.status === status,
    );
  });
}

test("streamChatCompletion rejects an empty stream", async () => {
  await assert.rejects(
    streamChatCompletion(
      input,
      { onDelta: () => {} },
      async () => sseResponse(["data: [DONE]\n\n"]),
    ),
    (error: unknown) => error instanceof ChatActionError && error.code === "empty",
  );
});

test("streamChatCompletion propagates abort as AbortError", async () => {
  const controller = new AbortController();
  const fetcher: typeof fetch = async (_url, init) => {
    const stream = new ReadableStream<Uint8Array>({
      start(sseController) {
        sseController.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"你"}}]}\n\n'));
        init?.signal?.addEventListener("abort", () => {
          sseController.error(new DOMException("aborted", "AbortError"));
        });
      },
    });
    return new Response(stream, { headers: { "content-type": "text/event-stream" } });
  };
  const promise = streamChatCompletion(
    { ...input, signal: controller.signal },
    { onDelta: () => {} },
    fetcher,
  );
  queueMicrotask(() => controller.abort());
  await assert.rejects(promise, (error: unknown) => error instanceof DOMException && error.name === "AbortError");
});

test("requestGroupSchedule parses speakers and rejects invalid responses", async () => {
  const result = await requestGroupSchedule(
    input,
    async () => json({ speakers: [{ id: "p1", name: "闵先生" }] }),
  );
  assert.deepEqual(result.speakers, [{ id: "p1", name: "闵先生" }]);
  await assert.rejects(
    requestGroupSchedule(input, async () => json({ error: "调度失败" }, 502)),
    (error: unknown) => error instanceof ChatActionError && error.code === "unavailable",
  );
  await assert.rejects(
    requestGroupSchedule(input, async () => json({ speakers: [] })),
    (error: unknown) => error instanceof ChatActionError && error.code === "invalid",
  );
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
