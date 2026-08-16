import assert from "node:assert/strict";
import test from "node:test";
import {
  createTextMessageEnvelope,
  EnvelopeValidationError,
  parseMessageEnvelope,
} from "./message-envelope";

const valid = {
  schemaVersion: "1.0",
  messageId: "msg_123456",
  conversationId: "conv_123456",
  sender: { kind: "user", id: "subject_7" },
  parts: [{ type: "text", text: "你好" }],
  metadata: { adapter: "web" },
  createdAt: "2026-08-16T12:00:00Z",
};

test("createTextMessageEnvelope produces a valid envelope", () => {
  const envelope = createTextMessageEnvelope({
    messageId: "msg_123456",
    conversationId: "conv_123456",
    sender: { kind: "user", id: "subject_7" },
    text: "你好",
    createdAt: "2026-08-16T12:00:00Z",
  });
  assert.equal(parseMessageEnvelope(envelope).parts[0].type, "text");
});

test("parseMessageEnvelope accepts a valid envelope", () => {
  const parsed = parseMessageEnvelope(valid);
  assert.equal(parsed.sender.id, "subject_7");
  assert.equal(parsed.metadata?.adapter, "web");
});

for (const [name, mutate] of [
  ["messageId 过短", (value: Record<string, unknown>) => ({ ...value, messageId: "x" })],
  ["conversationId 非法", (value: Record<string, unknown>) => ({ ...value, conversationId: "bad id!" })],
  ["sender.kind 无效", (value: Record<string, unknown>) => ({ ...value, sender: { kind: "robot", id: "subject_7" } })],
  ["createdAt 非法", (value: Record<string, unknown>) => ({ ...value, createdAt: "not-a-date" })],
] as const) {
  test(`parseMessageEnvelope rejects ${name}`, () => {
    assert.throws(() => parseMessageEnvelope(mutate(valid)), EnvelopeValidationError);
  });
}

test("parseMessageEnvelope rejects empty parts and unsupported part types", () => {
  assert.throws(() => parseMessageEnvelope({ ...valid, parts: [] }), EnvelopeValidationError);
  assert.throws(
    () => parseMessageEnvelope({ ...valid, parts: [{ type: "unknown", text: "x" }] }),
    EnvelopeValidationError,
  );
});
