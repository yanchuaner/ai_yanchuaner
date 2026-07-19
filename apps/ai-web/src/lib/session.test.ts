import assert from "node:assert/strict";
import test from "node:test";
import { isValidAiSession, isValidLoginTransaction, seal, unseal, type AiSession } from "./session";

const secret = "01234567890123456789012345678901";

test("sealed session round-trips and rejects tampering", () => {
  const payload = { sub: "member-1", grant: "sensitive" };
  const sealed = seal(payload, secret);
  assert.deepEqual(unseal(sealed, secret), payload);
  const parts = sealed.split(".");
  const encrypted = Buffer.from(parts[2], "base64url");
  encrypted[0] ^= 1;
  parts[2] = encrypted.toString("base64url");
  assert.equal(unseal(parts.join("."), secret), null);
  assert.doesNotMatch(sealed, /member-1|sensitive/);
});

test("login and YanCore sessions fail closed after expiry", () => {
  assert.equal(
    isValidLoginTransaction({ state: "state", nonce: "nonce", codeVerifier: "verifier", expiresAt: 999 }, 1_000),
    false,
  );
  const session: AiSession = {
    identity: { sub: "member-1", name: "Member", role: "alumni" },
    subject: { userId: 1, application: "ai-web", audience: "yanchuaner-ai", scopes: "chat:read chat:write" },
    grant: "grant",
    grantExpiresAt: 999,
  };
  assert.equal(isValidAiSession(session, 1_000), false);
  session.grantExpiresAt = 1_001;
  assert.equal(isValidAiSession(session, 1_000), true);
});
