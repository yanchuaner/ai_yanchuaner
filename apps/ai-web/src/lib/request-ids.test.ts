import assert from "node:assert/strict";
import test from "node:test";
import {
  createClientRequestId,
  createTraceId,
  normalizeRequestId,
  resolveRequestIds,
} from "./request-ids";

test("request id generators return non-empty uuid-like values", () => {
  assert.match(createClientRequestId(), /^[0-9a-f-]{36}$/);
  assert.match(createTraceId(), /^[0-9a-f-]{36}$/);
  assert.notEqual(createClientRequestId(), createClientRequestId());
});

test("normalizeRequestId trims, bounds length and rejects unsafe characters", () => {
  assert.equal(normalizeRequestId("  abc-123  "), "abc-123");
  assert.equal(normalizeRequestId(""), undefined);
  assert.equal(normalizeRequestId("x".repeat(129)), undefined);
  assert.equal(normalizeRequestId("含中文"), undefined);
  assert.equal(normalizeRequestId("line\nbreak"), undefined);
  assert.equal(normalizeRequestId(null), undefined);
});

test("resolveRequestIds keeps valid values and falls back to generated ids", () => {
  const resolved = resolveRequestIds("client-1", "trace-1");
  assert.deepEqual(resolved, { clientRequestId: "client-1", traceId: "trace-1" });
  const fallback = resolveRequestIds("", null);
  assert.match(fallback.clientRequestId, /^[0-9a-f-]{36}$/);
  assert.match(fallback.traceId, /^[0-9a-f-]{36}$/);
});
