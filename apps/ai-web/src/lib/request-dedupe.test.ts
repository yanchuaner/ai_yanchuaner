import assert from "node:assert/strict";
import test from "node:test";
import { createRequestDedupe } from "@/lib/request-dedupe";

test("duplicate pending request is blocked and allowed again after failure", () => {
  const dedupe = createRequestDedupe();
  assert.deepEqual(dedupe.begin("client-1"), { allowed: true });
  assert.deepEqual(dedupe.begin("client-1"), { allowed: false, status: "pending" });
  dedupe.finish("client-1", "failed");
  assert.deepEqual(dedupe.begin("client-1"), { allowed: true });
});

test("billed request blocks duplicates until expiry", () => {
  let fakeNow = 1_000_000;
  const dedupe = createRequestDedupe({ ttlMs: 10_000, now: () => fakeNow });
  assert.deepEqual(dedupe.begin("client-2"), { allowed: true });
  dedupe.finish("client-2", "billed");
  assert.deepEqual(dedupe.begin("client-2"), { allowed: false, status: "billed" });
  fakeNow += 10_001;
  assert.deepEqual(dedupe.begin("client-2"), { allowed: true });
});

test("unknown outcome keeps request pending until ttl", () => {
  let fakeNow = 2_000_000;
  const dedupe = createRequestDedupe({ ttlMs: 10_000, now: () => fakeNow });
  assert.deepEqual(dedupe.begin("client-3"), { allowed: true });
  dedupe.finish("client-3", "unknown");
  assert.deepEqual(dedupe.begin("client-3"), { allowed: false, status: "pending" });
  fakeNow += 10_001;
  assert.deepEqual(dedupe.begin("client-3"), { allowed: true });
});
