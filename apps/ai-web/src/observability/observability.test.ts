import assert from "node:assert/strict";
import test from "node:test";
import { createObservabilityHub } from "./port";
import { sanitizeForLog } from "./sanitize";

test("sanitizeForLog redacts sensitive keys recursively", () => {
  const sanitized = sanitizeForLog({
    traceId: "tr_123456",
    attributes: {
      message: "正文",
      grant: "grant-secret",
      accessKey: "sk-secret",
      cookie: "yc=1",
      knowledge: "资料",
      safe: "ok",
    },
  }) as Record<string, unknown>;
  assert.equal(sanitized.traceId, "tr_123456");
  assert.equal((sanitized.attributes as Record<string, unknown>).message, "[REDACTED]");
  assert.equal((sanitized.attributes as Record<string, unknown>).grant, "[REDACTED]");
  assert.equal((sanitized.attributes as Record<string, unknown>).safe, "ok");
});

test("observability hub ignores exporter failures", async () => {
  let received = 0;
  const hub = createObservabilityHub([
    {
      export(event) {
        received += 1;
        if (event.entity === "run" && event.phase === "completed") throw new Error("boom");
      },
    },
  ]);
  const event = {
    schemaVersion: "1.0" as const,
    eventId: "evt_123456",
    entity: "run" as const,
    phase: "completed" as const,
    runId: "run_123456",
    timestamp: "2026-08-17T00:00:00Z",
    attributes: {},
    conversationId: "conv_123456",
    outcome: "success" as const,
    durationMs: 12,
  };
  hub.publish(event);
  hub.publish(event);
  assert.equal(received, 2);
});

test("hub sink sanitizes before export", () => {
  const seen: unknown[] = [];
  const hub = createObservabilityHub([
    {
      export(event) {
        seen.push(event);
      },
    },
  ]);
  hub.sink({
    schemaVersion: "1.0",
    eventId: "evt_123456",
    entity: "step",
    phase: "failed",
    runId: "run_123456",
    stepId: "step_123456",
    timestamp: "2026-08-17T00:00:00Z",
    attributes: { grant: "g", message: "正文" },
  });
  const exported = seen[0] as { attributes: Record<string, unknown> };
  assert.equal(exported.attributes.grant, "[REDACTED]");
  assert.equal(exported.attributes.message, "[REDACTED]");
});
