import assert from "node:assert/strict";
import test from "node:test";
import { createCapabilityAdapter } from "./adapters";
import { CapabilityRegistryError } from "./registry";
import { runChatV1 } from "@/workflows/chat-v1";

const base = new URL("https://api.example.test");
const key = `sk-yc_${"a".repeat(64)}`;

test("adapter rejects unknown capability id", () => {
  const adapter = createCapabilityAdapter({ model: "deepseek-chat" });
  assert.throws(
    () => adapter.resolveModel("unknown.capability"),
    (error: unknown) => error instanceof CapabilityRegistryError,
  );
});

test("replacing provider does not require workflow changes", async () => {
  const seen: string[] = [];
  const run = (model: string) =>
    runChatV1({
      runId: "run_123456",
      capabilityId: "text.chat.general",
      adapter: createCapabilityAdapter({ model }),
      messages: [{ role: "user", content: "你好" }],
      accessKey: key,
      apiBaseUrl: base,
      traceId: "tr_123456",
      clientRequestId: "client_123456",
      onEvent: () => {},
      fetcher: async (_input, init) => {
        seen.push((JSON.parse(String(init?.body)) as { model: string }).model);
        return new Response("data: [DONE]\n\n", { headers: { "Content-Type": "text/event-stream" } });
      },
    });
  await run("deepseek-chat");
  await run("provider-b-model");
  assert.deepEqual(seen, ["deepseek-chat", "provider-b-model"]);
});
