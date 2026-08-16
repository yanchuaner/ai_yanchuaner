// 燕中 AI 消息信封 v1：领域层唯一消息形态，不包含 Web File、SSE 原始行或供应商响应。

export const MESSAGE_ENVELOPE_SCHEMA_VERSION = "1.0";

export type MessageSenderKind = "user" | "assistant" | "persona" | "system" | "tool";

export type MessageSender = {
  kind: MessageSenderKind;
  id: string;
  displayName?: string;
};

export type TextMessagePart = { type: "text"; text: string };
export type MediaMessagePart = {
  type: "image_ref" | "audio_ref";
  mediaId: string;
  mimeType?: string;
  alt?: string;
};
export type ToolCallMessagePart = {
  type: "tool_call";
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
};
export type ToolResultMessagePart = {
  type: "tool_result";
  callId: string;
  status: "success" | "error" | "denied" | "cancelled" | "truncated";
  content?: unknown;
  errorCode?: string;
};
export type ErrorMessagePart = { type: "error"; code: string; message: string };

export type MessagePart =
  | TextMessagePart
  | MediaMessagePart
  | ToolCallMessagePart
  | ToolResultMessagePart
  | ErrorMessagePart;

export type MessageEnvelope = {
  schemaVersion: typeof MESSAGE_ENVELOPE_SCHEMA_VERSION;
  messageId: string;
  conversationId: string;
  sender: MessageSender;
  parts: MessagePart[];
  metadata?: {
    adapter?: string;
    replyTo?: string | null;
    traceId?: string;
    [key: string]: unknown;
  };
  createdAt: string;
};

export class EnvelopeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvelopeValidationError";
  }
}

const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertOpaqueId(value: unknown, field: string): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length < 6 ||
    value.length > 128 ||
    !OPAQUE_ID_PATTERN.test(value)
  ) {
    throw new EnvelopeValidationError(`${field} 必须是 6-128 位不透明 ID。`);
  }
}

function assertTimestamp(value: unknown): asserts value is string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new EnvelopeValidationError("created_at 必须是合法时间戳。");
  }
}

function assertSender(value: unknown): asserts value is MessageSender {
  if (!isRecord(value)) throw new EnvelopeValidationError("sender 必须是对象。");
  if (!["user", "assistant", "persona", "system", "tool"].includes(String(value.kind))) {
    throw new EnvelopeValidationError("sender.kind 无效。");
  }
  assertOpaqueId(value.id, "sender.id");
}

function assertPart(value: unknown): asserts value is MessagePart {
  if (!isRecord(value)) throw new EnvelopeValidationError("part 必须是对象。");
  if (value.type === "text") {
    if (typeof value.text !== "string" || value.text.length === 0 || value.text.length > 1_048_576) {
      throw new EnvelopeValidationError("text part 的 text 无效。");
    }
    return;
  }
  if (value.type === "image_ref" || value.type === "audio_ref") {
    assertOpaqueId(value.mediaId, "part.mediaId");
    return;
  }
  if (value.type === "tool_call") {
    assertOpaqueId(value.callId, "part.callId");
    if (typeof value.name !== "string" || !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/.test(value.name)) {
      throw new EnvelopeValidationError("tool_call part 的 name 无效。");
    }
    if (!isRecord(value.arguments)) throw new EnvelopeValidationError("tool_call part 的 arguments 必须是对象。");
    return;
  }
  if (value.type === "tool_result") {
    assertOpaqueId(value.callId, "part.callId");
    if (!["success", "error", "denied", "cancelled", "truncated"].includes(String(value.status))) {
      throw new EnvelopeValidationError("tool_result part 的 status 无效。");
    }
    return;
  }
  if (value.type === "error") {
    if (typeof value.code !== "string" || typeof value.message !== "string" || value.message.length === 0) {
      throw new EnvelopeValidationError("error part 的 code/message 无效。");
    }
    return;
  }
  throw new EnvelopeValidationError(`part.type ${String(value.type)} 不受支持。`);
}

export function parseMessageEnvelope(value: unknown): MessageEnvelope {
  if (!isRecord(value)) throw new EnvelopeValidationError("消息信封必须是对象。");
  if (value.schemaVersion !== MESSAGE_ENVELOPE_SCHEMA_VERSION) {
    throw new EnvelopeValidationError("消息信封 schema 版本不受支持。");
  }
  assertOpaqueId(value.messageId, "messageId");
  assertOpaqueId(value.conversationId, "conversationId");
  assertSender(value.sender);
  assertTimestamp(value.createdAt);
  if (!Array.isArray(value.parts) || value.parts.length === 0 || value.parts.length > 64) {
    throw new EnvelopeValidationError("parts 必须是 1-64 个内容块。");
  }
  for (const part of value.parts) assertPart(part);
  const envelope: MessageEnvelope = {
    schemaVersion: MESSAGE_ENVELOPE_SCHEMA_VERSION,
    messageId: value.messageId,
    conversationId: value.conversationId,
    sender: value.sender as MessageSender,
    parts: value.parts as MessagePart[],
    createdAt: value.createdAt,
  };
  if (isRecord(value.metadata)) {
    envelope.metadata = value.metadata as MessageEnvelope["metadata"];
  }
  return envelope;
}

export type CreateTextMessageInput = {
  messageId: string;
  conversationId: string;
  sender: MessageSender;
  text: string;
  metadata?: MessageEnvelope["metadata"];
  createdAt?: string;
};

export function createTextMessageEnvelope(input: CreateTextMessageInput): MessageEnvelope {
  const envelope = parseMessageEnvelope({
    schemaVersion: MESSAGE_ENVELOPE_SCHEMA_VERSION,
    messageId: input.messageId,
    conversationId: input.conversationId,
    sender: input.sender,
    parts: [{ type: "text", text: input.text }],
    metadata: input.metadata,
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
  return envelope;
}
