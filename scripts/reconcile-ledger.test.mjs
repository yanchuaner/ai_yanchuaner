import assert from "node:assert/strict";
import test from "node:test";
import { buildReport } from "./reconcile-ledger.mjs";

const base = {
  localMessages: [
    { messageId: "m1", requestId: "req-1", usage: { prompt: 10, completion: 5 } },
  ],
  gatewayLogs: [
    { request_id: "req-1", prompt_tokens: 10, completion_tokens: 5, quota: 12, created_at: 1_800_000 },
  ],
  ledgerEntries: [
    { request_id: "req-1", entry_type: "reserve", amount: -35 },
    { request_id: "req-1", entry_type: "settlement", amount: 23 },
  ],
};

test("matching evidence passes", () => {
  const report = buildReport({ ...base, now: 2_000_000 });
  assert.equal(report.ok, true);
  assert.deepEqual(report.mismatches, []);
});

test("local request id without gateway log is reported", () => {
  const report = buildReport({
    ...base,
    localMessages: [{ messageId: "m2", requestId: "req-missing" }],
    gatewayLogs: [],
    ledgerEntries: [],
  });
  assert.equal(report.ok, false);
  assert.equal(report.mismatches[0].code, "missing_gateway_log");
});

test("request with only reserve and stale age is unsettled", () => {
  const report = buildReport({
    ...base,
    ledgerEntries: [{ request_id: "req-1", entry_type: "reserve", amount: -35 }],
    now: 2_000_000,
    graceMs: 60_000,
  });
  assert.equal(report.ok, false);
  assert.equal(report.mismatches[0].code, "unsettled_reserve");
});

test("usage mismatch is reported", () => {
  const report = buildReport({
    ...base,
    localMessages: [
      { messageId: "m1", requestId: "req-1", usage: { prompt: 99, completion: 5 } },
    ],
  });
  assert.equal(report.ok, false);
  assert.equal(report.mismatches[0].code, "usage_mismatch");
});

test("ledger charge mismatch with log quota is reported", () => {
  const report = buildReport({
    ...base,
    ledgerEntries: [
      { request_id: "req-1", entry_type: "reserve", amount: -35 },
      { request_id: "req-1", entry_type: "settlement", amount: 30 },
    ],
  });
  assert.equal(report.ok, false);
  assert.equal(report.mismatches[0].code, "quota_mismatch");
});

test("messages without request id are ignored", () => {
  const report = buildReport({
    ...base,
    localMessages: [{ messageId: "m0" }],
    gatewayLogs: [],
    ledgerEntries: [],
  });
  assert.equal(report.ok, true);
});
