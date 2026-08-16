// Web 接入适配器：浏览器消息与领域 MessageEnvelope 互转，边界执行校验。

import {
  createTextMessageEnvelope,
  EnvelopeValidationError,
  parseMessageEnvelope,
  type MessageEnvelope,
} from "@/domain/message-envelope";

export type WebChatInput = {
  conversationId: string;
  messageId: string;
  senderId: string;
  content: string;
  imageUrl?: string;
  traceId?: string;
  clientRequestId?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertWebString(value: unknown, field: string, maxLength: number): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) {
    throw new EnvelopeValidationError(`${field} 无效。`);
  }
}

function toSenderId(senderId: string): string {
  return senderId.startsWith("subject_") ? senderId : `subject_${senderId}`;
}

export function parseWebChatInput(value: unknown): WebChatInput {
  if (!isRecord(value)) throw new EnvelopeValidationError("Web 聊天请求必须是对象。");
  assertWebString(value.conversationId, "conversationId", 128);
  assertWebString(value.messageId, "messageId", 128);
  assertWebString(value.senderId, "senderId", 255);
  assertWebString(value.content, "content", 16_000);
  if (value.imageUrl !== undefined && typeof value.imageUrl !== "string") {
    throw new EnvelopeValidationError("imageUrl 无效。");
  }
  const result: WebChatInput = {
    conversationId: value.conversationId,
    messageId: value.messageId,
    senderId: value.senderId,
    content: value.content,
  };
  if (typeof value.imageUrl === "string") result.imageUrl = value.imageUrl;
  if (typeof value.traceId === "string") result.traceId = value.traceId;
  if (typeof value.clientRequestId === "string") result.clientRequestId = value.clientRequestId;
  return result;
}

export function webChatInputToEnvelope(input: WebChatInput): MessageEnvelope {
  const metadata: MessageEnvelope["metadata"] = {
    adapter: "web",
    ...(input.traceId ? { traceId: input.traceId } : {}),
    ...(input.imageUrl ? { image_url: input.imageUrl } : {}),
  };
  if (input.clientRequestId) metadata.clientRequestId = input.clientRequestId;
  return createTextMessageEnvelope({
    messageId: input.messageId,
    conversationId: input.conversationId,
    sender: { kind: "user", id: toSenderId(input.senderId) },
    text: input.content,
    metadata,
  });
}

export function envelopeToWebChatMessage(
  envelope: MessageEnvelope,
): { role: "user" | "assistant"; content: string; imageUrl?: string } {
  const parsed = parseMessageEnvelope(envelope);
  const content = parsed.parts
    .filter((part) => part.type === "text")
    .map((part) => (part as { text: string }).text)
    .join("\n");
  const imageUrl =
    parsed.metadata && typeof parsed.metadata.image_url === "string" ? parsed.metadata.image_url : undefined;
  return {
    role: parsed.sender.kind === "assistant" || parsed.sender.kind === "persona" ? "assistant" : "user",
    content,
    ...(imageUrl ? { imageUrl } : {}),
  };
}
