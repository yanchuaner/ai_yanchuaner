import assert from "node:assert/strict";
import test from "node:test";
import { runRoleplayV1 } from "./roleplay-v1";
import { createCapabilityAdapter } from "@/capabilities/adapters";

const base = new URL("https://api.example.test");
const adapter = createCapabilityAdapter({ model: "deepseek-chat" });
const degradedAdapter = createCapabilityAdapter({ model: "deepseek-chat", embeddingModel: "BAAI/bge-m3" });
const persona = {
  id: "persona_1",
  name: "闵先生",
  description: "班主任",
  firstMessage: "同学们好。",
};

test("runRoleplayV1 streams with persona context and emits lifecycle events", async () => {
  const events: string[] = [];
  const fetcher: typeof fetch = async (_input, init) => {
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer sk-yc_${"a".repeat(64)}`);
    return new Response("data: [DONE]\n\n", {
      headers: { "Content-Type": "text/event-stream", "X-Request-Id": "req_123456" },
    });
  };
  const response = await runRoleplayV1({
    runId: "run_123456",
    conversationId: "conv_123456",
    userId: 7,
    persona,
    history: [{ role: "user", content: "老师好" }],
    query: "老师好",
    capabilityId: "text.chat.general",
    adapter,
    accessKey: `sk-yc_${"a".repeat(64)}`,
    apiBaseUrl: base,
    traceId: "tr_123456",
    clientRequestId: "client_123456",
    onEvent: (event) => events.push(`${event.entity}.${event.phase}:${event.stepId ?? ""}`),
    fetcher,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-trace-id"), "tr_123456");
  assert.ok(events.includes("step.completed:roleplay.context.build"));
  assert.ok(events.some((event) => event.startsWith("capability.started:")));
  assert.ok(events.includes("run.completed:"));
});

test("runRoleplayV1 emits degraded when knowledge embedding fails", async () => {
  const events: string[] = [];
  const fetcher: typeof fetch = async (_input) => {
    const url = String(_input);
    if (url.endsWith("/v1/embeddings")) {
      return Response.json({ error: "embedding down" }, { status: 502 });
    }
    return new Response("data: [DONE]\n\n", {
      headers: { "Content-Type": "text/event-stream", "X-Request-Id": "req_123456" },
    });
  };
  const response = await runRoleplayV1({
    runId: "run_123456",
    conversationId: "conv_123456",
    userId: 7,
    persona,
    history: [],
    query: "往事",
    capabilityId: "text.chat.general",
    adapter: degradedAdapter,
    accessKey: `sk-yc_${"a".repeat(64)}`,
    apiBaseUrl: base,
    traceId: "tr_123456",
    clientRequestId: "client_123456",
    onEvent: (event) => events.push(`${event.entity}.${event.phase}:${event.stepId ?? ""}`),
    fetcher,
  });
  assert.equal(response.status, 200);
  assert.ok(events.includes("step.degraded:roleplay.context.build"));
});
