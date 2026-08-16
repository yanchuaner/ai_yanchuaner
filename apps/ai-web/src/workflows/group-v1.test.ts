import assert from "node:assert/strict";
import test from "node:test";
import { ChatV1Error } from "./chat-v1";
import { runGroupScheduleV1, runGroupSpeakerV1 } from "./group-v1";
import { createCapabilityAdapter } from "@/capabilities/adapters";

const base = new URL("https://api.example.test");
const adapter = createCapabilityAdapter({ model: "deepseek-chat" });
const first = { id: "persona_1", name: "闵先生", description: "班主任", firstMessage: "你好" };
const second = { id: "persona_2", name: "马蛋", description: "学霸", firstMessage: "嗯" };

test("runGroupScheduleV1 parses speakers from the scheduler response", async () => {
  const events: string[] = [];
  const fetcher: typeof fetch = async () =>
    Response.json({
      choices: [{ message: { content: '{"speakers":["闵先生"]}' } }],
    });
  const result = await runGroupScheduleV1({
    runId: "run_123456",
    conversationId: "conv_123456",
    cast: [first, second],
    history: [],
    latestUserContent: "你好",
    opening: false,
    capabilityId: "text.chat.general",
    adapter,
    accessKey: `sk-yc_${"a".repeat(64)}`,
    apiBaseUrl: base,
    traceId: "tr_123456",
    clientRequestId: "client_123456",
    onEvent: (event) => events.push(`${event.entity}.${event.phase}`),
    fetcher,
  });
  assert.deepEqual(result.speakers, [{ id: "persona_1", name: "闵先生" }]);
  assert.ok(events.includes("capability.started"));
  assert.ok(events.includes("run.completed"));
});

test("runGroupScheduleV1 maps scheduler failure to GATEWAY_ERROR", async () => {
  await assert.rejects(
    runGroupScheduleV1({
      runId: "run_123456",
      conversationId: "conv_123456",
      cast: [first, second],
      history: [],
      latestUserContent: "你好",
      opening: false,
      capabilityId: "text.chat.general",
      adapter,
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

test("runGroupSpeakerV1 streams a speaker reply with lifecycle events", async () => {
  const events: string[] = [];
  const fetcher: typeof fetch = async () =>
    new Response("data: [DONE]\n\n", {
      headers: { "Content-Type": "text/event-stream", "X-Request-Id": "req_123456" },
    });
  const response = await runGroupSpeakerV1({
    runId: "run_123456",
    conversationId: "conv_123456",
    userId: 7,
    speaker: first,
    cast: [first, second],
    history: [],
    latestUserContent: "你好",
    opening: false,
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
  assert.ok(events.includes("step.completed:group.context.build"));
  assert.ok(events.some((event) => event.startsWith("capability.started:")));
});

test("runGroupSpeakerV1 maps upstream 401 to SESSION_REVOKED", async () => {
  await assert.rejects(
    runGroupSpeakerV1({
      runId: "run_123456",
      conversationId: "conv_123456",
      userId: 7,
      speaker: first,
      cast: [first, second],
      history: [],
      latestUserContent: "你好",
      opening: false,
      capabilityId: "text.chat.general",
      adapter,
      accessKey: `sk-yc_${"a".repeat(64)}`,
      apiBaseUrl: base,
      traceId: "tr_123456",
      clientRequestId: "client_123456",
      onEvent: () => {},
      fetcher: async () => Response.json({ error: "revoked" }, { status: 401 }),
    }),
    (error: unknown) => error instanceof ChatV1Error && error.code === "SESSION_REVOKED",
  );
});
