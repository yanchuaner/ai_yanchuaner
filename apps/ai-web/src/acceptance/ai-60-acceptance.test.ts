import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runChatV1, ChatV1Error } from "@/workflows/chat-v1";
import { runRoleplayV1 } from "@/workflows/roleplay-v1";
import { runGroupScheduleV1, runGroupSpeakerV1 } from "@/workflows/group-v1";
import { WorkflowRuntimeError, runWorkflow } from "@/domain/workflow-runtime";
import { runDataMigrations } from "@/lib/data-migrations";
import { createMemoryByokSettingsRepository } from "@/lib/byok-settings-memory-repository";
import { sanitizeForLog } from "@/observability/sanitize";
import { EnvelopeValidationError, parseMessageEnvelope } from "@/domain/message-envelope";
import { CAPABILITY_MANIFESTS, createCapabilityRegistry } from "@/capabilities/registry";
import { createCapabilityAdapter } from "@/capabilities/adapters";

const base = new URL("https://api.example.test");
const key = `sk-yc_${"a".repeat(64)}`;
const persona = { id: "persona_1", name: "闵先生", description: "班主任", firstMessage: "你好" };
const adapter = createCapabilityAdapter({ model: "deepseek-chat" });
const degradedAdapter = createCapabilityAdapter({ model: "deepseek-chat", embeddingModel: "BAAI/bge-m3" });

test("acceptance: plain chat streams and preserves upstream status", async () => {
  const response = await runChatV1({
    runId: "run_123456",
    capabilityId: "text.chat.general",
    adapter,
    messages: [{ role: "user", content: "你好" }],
    accessKey: key,
    apiBaseUrl: base,
    traceId: "tr_123456",
    clientRequestId: "client_123456",
    onEvent: () => {},
    fetcher: async () =>
      new Response("data: [DONE]\n\n", {
        headers: { "Content-Type": "text/event-stream", "X-Request-Id": "req_123456" },
      }),
  });
  assert.equal(response.status, 200);
  await assert.rejects(
    runChatV1({
      runId: "run_123456",
      capabilityId: "text.chat.general",
      adapter,
      messages: [{ role: "user", content: "你好" }],
      accessKey: key,
      apiBaseUrl: base,
      traceId: "tr_123456",
      clientRequestId: "client_123456",
      onEvent: () => {},
      fetcher: async () => Response.json({ error: "quota" }, { status: 402 }),
    }),
    (error: unknown) => error instanceof ChatV1Error && error.status === 402,
  );
});

test("acceptance: roleplay emits degraded on knowledge failure", async () => {
  const events: string[] = [];
  const response = await runRoleplayV1({
    runId: "run_123456",
    conversationId: "conv_123456",
    userId: 7,
    persona,
    history: [],
    query: "往事",
    capabilityId: "text.chat.general",
    adapter: degradedAdapter,
    accessKey: key,
    apiBaseUrl: base,
    traceId: "tr_123456",
    clientRequestId: "client_123456",
    onEvent: (event) => events.push(`${event.entity}.${event.phase}`),
    fetcher: async (input) =>
      String(input).endsWith("/v1/embeddings")
        ? Response.json({ error: "down" }, { status: 502 })
        : new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } }),
  });
  assert.equal(response.status, 200);
  assert.ok(events.includes("step.degraded"));
});

test("acceptance: group schedule and speaker run as workflows", async () => {
  const schedule = await runGroupScheduleV1({
    runId: "run_123456",
    conversationId: "conv_123456",
    cast: [persona, { id: "persona_2", name: "马蛋", description: "学霸", firstMessage: "嗯" }],
    history: [],
    latestUserContent: "大家好",
    opening: false,
    capabilityId: "text.chat.general",
    adapter,
    accessKey: key,
    apiBaseUrl: base,
    traceId: "tr_123456",
    clientRequestId: "client_123456",
    onEvent: () => {},
    fetcher: async () => Response.json({ choices: [{ message: { content: '{"speakers":["闵先生"]}' } }] }),
  });
  assert.equal(schedule.speakers.length, 1);
  const response = await runGroupSpeakerV1({
    runId: "run_123456",
    conversationId: "conv_123456",
    userId: 7,
    speaker: persona,
    cast: [persona],
    history: [],
    latestUserContent: "大家好",
    opening: false,
    capabilityId: "text.chat.general",
    adapter,
    accessKey: key,
    apiBaseUrl: base,
    traceId: "tr_123456",
    clientRequestId: "client_123456",
    onEvent: () => {},
    fetcher: async () =>
      new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } }),
  });
  assert.equal(response.status, 200);
});

test("acceptance: cancel and session revocation are stable terminal states", async () => {
  const controller = new AbortController();
  const promise = runWorkflow({
    workflowId: "acceptance",
    version: "1.0.0",
    runId: "run_123456",
    signal: controller.signal,
    onEvent: () => {},
    steps: [
      {
        id: "step_123456",
        run: async (context) => {
          await new Promise((_resolve, reject) => {
            context.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          });
        },
      },
    ],
  });
  queueMicrotask(() => controller.abort());
  await assert.rejects(promise, (error: unknown) => error instanceof WorkflowRuntimeError && error.code === "cancelled");

  await assert.rejects(
    runChatV1({
      runId: "run_123456",
      capabilityId: "text.chat.general",
      adapter,
      messages: [{ role: "user", content: "你好" }],
      accessKey: key,
      apiBaseUrl: base,
      traceId: "tr_123456",
      clientRequestId: "client_123456",
      onEvent: () => {},
      fetcher: async () => Response.json({ error: "revoked" }, { status: 401 }),
    }),
    (error: unknown) => error instanceof ChatV1Error && error.code === "SESSION_REVOKED",
  );
});

test("acceptance: migration, BYOK erase, sanitization and negative contracts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "ai-accept-"));
  try {
    await mkdir(path.join(root, "conversations"), { recursive: true });
    await writeFile(
      path.join(root, "conversations", "7.json"),
      JSON.stringify({ conversations: [] }),
    );
    const migration = await runDataMigrations({ dataDir: root, dryRun: true });
    assert.equal(migration.scanned, 1);

    const byok = createMemoryByokSettingsRepository();
    await byok.updateMedia(7, { baseUrl: "https://x.test", visionModel: "v", imageModel: "i", apiKey: "k" });
    await byok.clearMedia(7);
    assert.equal(await byok.getMedia(7), null);

    const sanitized = sanitizeForLog({ grant: "g", message: "正文", traceId: "tr_1" }) as Record<string, unknown>;
    assert.equal(sanitized.grant, "[REDACTED]");
    assert.equal(sanitized.traceId, "tr_1");

    assert.throws(() => parseMessageEnvelope({}), EnvelopeValidationError);
    assert.throws(() => createCapabilityRegistry([CAPABILITY_MANIFESTS[0], CAPABILITY_MANIFESTS[0]]), /重复/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
