import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createObservabilityHub } from "./port";
import { createJsonlObservabilityExporter } from "./jsonl-exporter";

test("exporter saves sanitized events and queries by request id", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-obs-"));
  const file = path.join(dir, "events.jsonl");
  try {
    const exporter = createJsonlObservabilityExporter(file);
    const hub = createObservabilityHub([exporter]);
    hub.sink({
      schemaVersion: "1.0",
      eventId: "evt_123456",
      entity: "capability",
      phase: "completed",
      runId: "run_123456",
      capabilityId: "text.chat.general",
      traceId: "tr_123456",
      clientRequestId: "client_123456",
      requestId: "req_123456",
      timestamp: "2026-08-17T00:00:00Z",
      durationMs: 12,
      attributes: { grant: "g", token: "t", message: "正文" },
      conversationId: "conv_123456",
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    const events = await exporter.queryByRequestId("req_123456");
    assert.equal(events.length, 1);
    assert.equal(events[0].conversationId, "conv_123456");
    assert.equal(events[0].durationMs, 12);
    const raw = await readFile(file, "utf8");
    assert.doesNotMatch(raw, /grant|token|正文/);
    assert.match(raw, /"requestId":"req_123456"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
