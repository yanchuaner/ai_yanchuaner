import assert from "node:assert/strict";
import test from "node:test";
import { ChatV1Error, runChatV1 } from "./chat-v1";
import { createCapabilityAdapter } from "@/capabilities/adapters";

const base = new URL("https://api.example.test");
const adapter = createCapabilityAdapter({ model: "deepseek-chat" });

test("runChatV1 returns the upstream SSE response and emits capability events", async () => {
  const events: string[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer sk-yc_${"a".repeat(64)}`);
    return new Response("data: [DONE]\n\n", {
      headers: {
        "Content-Type": "text/event-stream",
        "X-Request-Id": "req_123456",
      },
    });
  };
  const response = await runChatV1({
    runId: "run_123456",
    capabilityId: "text.chat.general",
    adapter,
    messages: [{ role: "user", content: "你好" }],
    accessKey: `sk-yc_${"a".repeat(64)}`,
    apiBaseUrl: base,
    traceId: "tr_123456",
    clientRequestId: "client_123456",
    onEvent: (event) => events.push(`${event.entity}.${event.phase}:${event.capabilityId ?? ""}`),
    fetcher,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  assert.equal(response.headers.get("x-trace-id"), "tr_123456");
  assert.equal(response.headers.get("x-client-request-id"), "client_123456");
  assert.deepEqual(events, [
    "run.started:",
    "step.started:",
    "capability.started:text.chat.general",
    "capability.completed:text.chat.general",
    "step.completed:",
    "run.completed:",
  ]);
});

test("runChatV1 maps upstream 401 to SESSION_REVOKED", async () => {
  await assert.rejects(
    runChatV1({
      runId: "run_123456",
      capabilityId: "text.chat.general",
      adapter,
      messages: [{ role: "user", content: "你好" }],
      accessKey: `sk-yc_${"a".repeat(64)}`,
      apiBaseUrl: base,
      traceId: "tr_123456",
      clientRequestId: "client_123456",
      onEvent: () => {},
      fetcher: async () => Response.json({ error: "revoked" }, { status: 401 }),
    }),
    (error: unknown) => error instanceof ChatV1Error && error.code === "SESSION_REVOKED" && error.status === 401,
  );
});

test("runChatV1 maps upstream 502 to GATEWAY_ERROR", async () => {
  await assert.rejects(
    runChatV1({
      runId: "run_123456",
      capabilityId: "text.chat.general",
      adapter,
      messages: [{ role: "user", content: "你好" }],
      accessKey: `sk-yc_${"a".repeat(64)}`,
      apiBaseUrl: base,
      traceId: "tr_123456",
      clientRequestId: "client_123456",
      onEvent: () => {},
      fetcher: async () => Response.json({ error: "down" }, { status: 502 }),
    }),
    (error: unknown) => error instanceof ChatV1Error && error.code === "GATEWAY_ERROR" && error.status === 502,
  );
});

for (const status of [402, 429] as const) {
  test(`runChatV1 preserves upstream ${status}`, async () => {
    await assert.rejects(
      runChatV1({
        runId: "run_123456",
        capabilityId: "text.chat.general",
        adapter,
        messages: [{ role: "user", content: "你好" }],
        accessKey: `sk-yc_${"a".repeat(64)}`,
        apiBaseUrl: base,
        traceId: "tr_123456",
        clientRequestId: "client_123456",
        onEvent: () => {},
        fetcher: async () => Response.json({ error: "失败" }, { status }),
      }),
      (error: unknown) =>
        error instanceof ChatV1Error && error.code === "GATEWAY_ERROR" && error.status === status,
    );
  });
}
