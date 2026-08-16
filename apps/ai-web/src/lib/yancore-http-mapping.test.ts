import assert from "node:assert/strict";
import test from "node:test";
import { mapYanCoreError } from "@/lib/yancore-http-mapping";
import { YanCoreError, type YanCoreErrorCode } from "@/lib/yancore-gateway";

const cases: Array<[YanCoreErrorCode, number, number?]> = [
  ["unauthenticated", 401],
  ["quota_exhausted", 402],
  ["forbidden", 403],
  ["not_found", 404],
  ["rate_limited", 429],
  ["upstream_unavailable", 502, 502],
  ["upstream_unavailable", 503, 503],
  ["timeout", 504],
  ["invalid_response", 502],
  ["internal_error", 502],
];

for (const [code, expectedStatus, upstreamStatus] of cases) {
  test(`maps ${code} to ${expectedStatus}`, () => {
    const mapped = mapYanCoreError(new YanCoreError(code, "SECRET_UPSTREAM_MESSAGE", upstreamStatus));
    assert.equal(mapped.status, expectedStatus);
    assert.equal(mapped.body.code, code);
    assert.doesNotMatch(JSON.stringify(mapped.body), /SECRET_UPSTREAM_MESSAGE/);
    assert.equal(mapped.clearSession, code === "unauthenticated");
  });
}

test("maps unknown errors to a sanitized 502 response", () => {
  const mapped = mapYanCoreError(new Error("SECRET_INTERNAL_MESSAGE"));
  assert.equal(mapped.status, 502);
  assert.equal(mapped.body.code, "internal_error");
  assert.doesNotMatch(JSON.stringify(mapped.body), /SECRET_INTERNAL_MESSAGE/);
  assert.equal(mapped.clearSession, false);
});
