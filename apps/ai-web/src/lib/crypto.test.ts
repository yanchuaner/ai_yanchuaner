import assert from "node:assert/strict";
import test from "node:test";
import { decryptSecret, encryptSecret } from "./crypto";

test("encrypted secrets round-trip and reject tampering", () => {
  const secret = "01234567890123456789012345678901";
  const payload = encryptSecret("sk-user-abc123", secret);
  assert.equal(decryptSecret(payload, secret), "sk-user-abc123");
  assert.equal(decryptSecret(payload, "x".repeat(32)), null);
  assert.equal(decryptSecret(`${payload.slice(0, -2)}xx`, secret), null);
  assert.equal(decryptSecret("bad", secret), null);
});

test("encryption requires a long enough master secret", () => {
  assert.throws(() => encryptSecret("sk", "short"), /at least 32/);
});
