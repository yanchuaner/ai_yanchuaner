import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm, stat } from "node:fs/promises";
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

test("exporter rotates oversized files and query spans rotated files", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-obs-rotation-"));
  const file = path.join(dir, "events.jsonl");
  const previousMax = process.env.AI_WEB_OBSERVABILITY_MAX_BYTES;
  const previousKeep = process.env.AI_WEB_OBSERVABILITY_KEEP_ROTATED;
  process.env.AI_WEB_OBSERVABILITY_MAX_BYTES = "80";
  process.env.AI_WEB_OBSERVABILITY_KEEP_ROTATED = "2";
  const sink = (exporter: ReturnType<typeof createJsonlObservabilityExporter>, requestId: string) => {
    createObservabilityHub([exporter]).sink({
      schemaVersion: "1.0",
      eventId: `evt_${requestId}`,
      entity: "capability",
      phase: "completed",
      runId: "run_123456",
      capabilityId: "text.chat.general",
      traceId: "tr_123456",
      clientRequestId: "client_123456",
      requestId,
      timestamp: "2026-08-17T00:00:00Z",
      attributes: {},
    });
  };
  try {
    const exporter = createJsonlObservabilityExporter(file);
    sink(exporter, "req-rotate-a");
    await new Promise((resolve) => setTimeout(resolve, 50));
    sink(exporter, "req-rotate-b");
    await new Promise((resolve) => setTimeout(resolve, 50));
    sink(exporter, "req-rotate-c");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal((await exporter.queryByRequestId("req-rotate-a")).length, 1);
    assert.equal((await exporter.queryByRequestId("req-rotate-b")).length, 1);
    assert.equal((await exporter.queryByRequestId("req-rotate-c")).length, 1);
    await stat(`${file}.1`);
    await stat(`${file}.2`);
  } finally {
    if (previousMax === undefined) delete process.env.AI_WEB_OBSERVABILITY_MAX_BYTES;
    else process.env.AI_WEB_OBSERVABILITY_MAX_BYTES = previousMax;
    if (previousKeep === undefined) delete process.env.AI_WEB_OBSERVABILITY_KEEP_ROTATED;
    else process.env.AI_WEB_OBSERVABILITY_KEEP_ROTATED = previousKeep;
    await rm(dir, { recursive: true, force: true });
  }
});

test("exporter query skips corrupt lines", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ai-obs-corrupt-"));
  const file = path.join(dir, "events.jsonl");
  try {
    const exporter = createJsonlObservabilityExporter(file);
    createObservabilityHub([exporter]).sink({
      schemaVersion: "1.0",
      eventId: "evt_ok123456",
      entity: "capability",
      phase: "completed",
      runId: "run_123456",
      capabilityId: "text.chat.general",
      traceId: "tr_123456",
      clientRequestId: "client_123456",
      requestId: "req-ok",
      timestamp: "2026-08-17T00:00:00Z",
      attributes: {},
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    await appendFile(file, "{broken json line\n", "utf8");
    const events = await exporter.queryByRequestId("req-ok");
    assert.equal(events.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
