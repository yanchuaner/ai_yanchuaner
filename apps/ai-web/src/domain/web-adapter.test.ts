import assert from "node:assert/strict";
import test from "node:test";
import { EnvelopeValidationError } from "./message-envelope";
import {
  envelopeToWebChatMessage,
  parseWebChatInput,
  webChatInputToEnvelope,
} from "./web-adapter";

const input = {
  conversationId: "conv_123456",
  messageId: "msg_123456",
  senderId: "7",
  content: "你好",
  traceId: "tr_123456",
  clientRequestId: "client_123456",
};

test("parseWebChatInput accepts a valid web request", () => {
  assert.deepEqual(parseWebChatInput(input), input);
});

test("parseWebChatInput rejects invalid requests", () => {
  assert.throws(() => parseWebChatInput({ ...input, content: "" }), EnvelopeValidationError);
  assert.throws(() => parseWebChatInput({ ...input, senderId: "" }), EnvelopeValidationError);
  assert.throws(() => parseWebChatInput(null), EnvelopeValidationError);
});

test("webChatInputToEnvelope converts to a valid user message envelope", () => {
  const envelope = webChatInputToEnvelope(input);
  assert.equal(envelope.sender.kind, "user");
  assert.equal(envelope.sender.id, "subject_7");
  assert.equal(envelope.metadata?.adapter, "web");
  assert.equal(envelope.metadata?.traceId, "tr_123456");
  assert.equal(envelope.metadata?.clientRequestId, "client_123456");
});

test("webChatInputToEnvelope keeps imageUrl in metadata", () => {
  const envelope = webChatInputToEnvelope({ ...input, imageUrl: "data:image/png;base64,AAAA" });
  assert.equal(envelope.metadata?.image_url, "data:image/png;base64,AAAA");
});

test("envelopeToWebChatMessage maps user and assistant roles and restores imageUrl", () => {
  const user = envelopeToWebChatMessage(
    webChatInputToEnvelope({ ...input, imageUrl: "data:image/png;base64,AAAA" }),
  );
  assert.equal(user.role, "user");
  assert.equal(user.content, "你好");
  assert.equal(user.imageUrl, "data:image/png;base64,AAAA");

  const assistant = webChatInputToEnvelope({ ...input, senderId: "persona_1", content: "回复" });
  assistant.sender.kind = "assistant";
  const mapped = envelopeToWebChatMessage(assistant);
  assert.equal(mapped.role, "assistant");
  assert.equal(mapped.content, "回复");
});
