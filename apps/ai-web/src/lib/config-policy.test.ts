import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedPublicUrl } from "./config-policy";

test("production public URL allows HTTP only for explicit loopback development", () => {
  assert.equal(isAllowedPublicUrl(new URL("https://ai.yanchuaner.cn"), true, false), true);
  assert.equal(isAllowedPublicUrl(new URL("http://localhost:3002"), true, true), true);
  assert.equal(isAllowedPublicUrl(new URL("http://127.0.0.1:3002"), true, true), true);
  assert.equal(isAllowedPublicUrl(new URL("http://[::1]:3002"), true, true), true);
  assert.equal(isAllowedPublicUrl(new URL("http://localhost:3002"), true, false), false);
  assert.equal(isAllowedPublicUrl(new URL("http://ai-web:3001"), true, true), false);
  assert.equal(isAllowedPublicUrl(new URL("http://ai.example.test"), true, true), false);
});
