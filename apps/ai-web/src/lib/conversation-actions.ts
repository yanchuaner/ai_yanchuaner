// 会话与对话动作：页面只调用类型化 action，不拼接 BFF 路径或解析响应 DTO。

import type {
  ChatMessage,
  ConversationDetail,
  ConversationInput,
  ConversationSummary,
} from "@/lib/types";

export type ConversationActionCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "unavailable"
  | "network";

export class ConversationActionError extends Error {
  constructor(
    public readonly code: ConversationActionCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ConversationActionError";
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

async function readBody(response: Response): Promise<JsonRecord | null> {
  return response.json().catch(() => null);
}

function messageFrom(body: JsonRecord | null, fallback: string): string {
  if (body && typeof body.error === "string" && body.error) return body.error;
  if (body && typeof body.message === "string" && body.message) return body.message;
  return fallback;
}

async function conversationRequest<T>(
  path: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(path, { cache: "no-store", ...init });
  } catch {
    throw new ConversationActionError("network", "网络请求失败。");
  }
  const body = await readBody(response);
  if (response.status === 401) throw new ConversationActionError("unauthenticated", "登录会话已失效。", 401);
  if (response.status === 403) throw new ConversationActionError("forbidden", "无权执行该操作。", 403);
  if (response.status === 404) throw new ConversationActionError("not_found", "会话不存在。", 404);
  if (!response.ok) {
    const code = response.status === 409 ? "conflict" : response.status >= 500 ? "unavailable" : "invalid";
    const message =
      response.status >= 500
        ? "服务暂时不可用。"
        : messageFrom(body, code === "conflict" ? "操作冲突。" : "操作失败。");
    throw new ConversationActionError(code, message, response.status);
  }
  if (body === null) throw new ConversationActionError("invalid", "接口返回格式无效。");
  return body as T;
}

function parseSummary(value: unknown): ConversationSummary {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.updatedAt !== "number" ||
    typeof value.messageCount !== "number" ||
    (value.mode !== "chat" && value.mode !== "roleplay" && value.mode !== "group")
  ) {
    throw new ConversationActionError("invalid", "会话列表条目格式无效。");
  }
  return {
    id: value.id,
    title: value.title,
    updatedAt: value.updatedAt,
    messageCount: value.messageCount,
    mode: value.mode,
    personaName: typeof value.personaName === "string" ? value.personaName : undefined,
    personaId: typeof value.personaId === "string" ? value.personaId : undefined,
    personaIds: Array.isArray(value.personaIds) && value.personaIds.every((item) => typeof item === "string")
      ? value.personaIds
      : undefined,
    pinned: typeof value.pinned === "boolean" ? value.pinned : undefined,
    archived: typeof value.archived === "boolean" ? value.archived : undefined,
  };
}

function parseMessage(value: unknown): ChatMessage {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    (value.role !== "user" && value.role !== "assistant") ||
    typeof value.content !== "string"
  ) {
    throw new ConversationActionError("invalid", "消息条目格式无效。");
  }
  const usage = value.usage;
  return {
    id: value.id,
    role: value.role,
    content: value.content,
    personaId: typeof value.personaId === "string" ? value.personaId : undefined,
    imageUrl: typeof value.imageUrl === "string" ? value.imageUrl : undefined,
    traceId: typeof value.traceId === "string" ? value.traceId : undefined,
    requestId: typeof value.requestId === "string" ? value.requestId : undefined,
    usage:
      isRecord(usage) && typeof usage.prompt === "number" && typeof usage.completion === "number"
        ? { prompt: usage.prompt, completion: usage.completion }
        : undefined,
  };
}

function parseDetail(value: unknown): ConversationDetail {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.updatedAt !== "number" ||
    (value.mode !== "chat" && value.mode !== "roleplay" && value.mode !== "group") ||
    !Array.isArray(value.messages)
  ) {
    throw new ConversationActionError("invalid", "会话详情格式无效。");
  }
  const detail: ConversationDetail = {
    id: value.id,
    title: value.title,
    updatedAt: value.updatedAt,
    mode: value.mode,
    messages: value.messages.map(parseMessage),
    persona: isRecord(value.persona) ? (value.persona as ConversationDetail["persona"]) : undefined,
    cast: Array.isArray(value.cast) ? (value.cast as ConversationDetail["cast"]) : undefined,
    director: isRecord(value.director) ? (value.director as ConversationDetail["director"]) : undefined,
    world: isRecord(value.world) ? (value.world as ConversationDetail["world"]) : undefined,
    userRole: isRecord(value.userRole) ? (value.userRole as ConversationDetail["userRole"]) : undefined,
    pinned: typeof value.pinned === "boolean" ? value.pinned : undefined,
    archived: typeof value.archived === "boolean" ? value.archived : undefined,
  };
  return detail;
}

export async function createConversation(
  input: ConversationInput = {},
  fetcher: typeof fetch = fetch,
): Promise<ConversationSummary> {
  const body = await conversationRequest<JsonRecord>(
    "/api/chat/conversations",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fetcher,
  );
  if (!isRecord(body.conversation)) throw new ConversationActionError("invalid", "创建会话响应格式无效。");
  return parseSummary(body.conversation);
}

export async function listConversations(fetcher: typeof fetch = fetch): Promise<ConversationSummary[]> {
  const body = await conversationRequest<JsonRecord>("/api/chat/conversations", {}, fetcher);
  if (!Array.isArray(body.conversations)) throw new ConversationActionError("invalid", "会话列表响应格式无效。");
  return body.conversations.map(parseSummary);
}

export async function getConversationDetail(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<ConversationDetail> {
  const body = await conversationRequest<JsonRecord>(
    `/api/chat/conversations/${encodeURIComponent(id)}`,
    {},
    fetcher,
  );
  return parseDetail(body);
}

export async function updateConversation(
  id: string,
  patch: { title?: string; pinned?: boolean; archived?: boolean },
  fetcher: typeof fetch = fetch,
): Promise<ConversationSummary> {
  const body = await conversationRequest<JsonRecord>(
    `/api/chat/conversations/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
    fetcher,
  );
  if (!isRecord(body.conversation)) throw new ConversationActionError("invalid", "更新会话响应格式无效。");
  return parseSummary(body.conversation);
}

export async function deleteConversation(id: string, fetcher: typeof fetch = fetch): Promise<void> {
  await conversationRequest<JsonRecord>(
    `/api/chat/conversations/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    fetcher,
  );
}

export async function exportConversation(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<{ id: string; text: string; filename: string }> {
  let response: Response;
  try {
    response = await fetcher(`/api/chat/conversations/${encodeURIComponent(id)}/export`, {
      cache: "no-store",
    });
  } catch {
    throw new ConversationActionError("network", "网络请求失败。");
  }
  if (response.status === 401) throw new ConversationActionError("unauthenticated", "登录会话已失效。", 401);
  if (response.status === 404) throw new ConversationActionError("not_found", "会话不存在。", 404);
  if (!response.ok) throw new ConversationActionError("invalid", "导出会话失败。", response.status);
  const text = await response.text();
  const disposition = response.headers.get("content-disposition") || "";
  const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `yanchuaner-ai-conversation-${id}.json`;
  return { id, text, filename };
}

export type ConversationMessageInput = {
  id: string;
  role: "user" | "assistant";
  content: string;
  personaId?: string;
  imageUrl?: string;
  traceId?: string;
  requestId?: string;
  usage?: { prompt: number; completion: number };
};

export async function appendConversationMessage(
  id: string,
  message: ConversationMessageInput,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  await conversationRequest<JsonRecord>(
    `/api/chat/conversations/${encodeURIComponent(id)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    },
    fetcher,
  );
}

export type ConversationMemoryResult = {
  summary: string | null;
  memories?: unknown[];
};

function parseMemoryBody(body: JsonRecord): ConversationMemoryResult {
  if (Array.isArray(body.memories)) return { summary: null, memories: body.memories };
  const memory = body.memory;
  if (isRecord(memory) && typeof memory.summary === "string") return { summary: memory.summary };
  return { summary: null };
}

export async function getConversationMemory(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<ConversationMemoryResult> {
  const body = await conversationRequest<JsonRecord>(
    `/api/chat/conversations/${encodeURIComponent(id)}/memory`,
    {},
    fetcher,
  );
  return parseMemoryBody(body);
}

export async function refreshConversationMemory(
  id: string,
  fetcher: typeof fetch = fetch,
): Promise<{ updated: boolean } & ConversationMemoryResult> {
  const body = await conversationRequest<JsonRecord>(
    `/api/chat/conversations/${encodeURIComponent(id)}/memory`,
    { method: "POST" },
    fetcher,
  );
  return { updated: body.updated === true, ...parseMemoryBody(body) };
}

export async function clearConversationMemory(id: string, fetcher: typeof fetch = fetch): Promise<void> {
  await conversationRequest<JsonRecord>(
    `/api/chat/conversations/${encodeURIComponent(id)}/memory`,
    { method: "DELETE" },
    fetcher,
  );
}
