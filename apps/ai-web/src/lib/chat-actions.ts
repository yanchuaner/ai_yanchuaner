// 对话请求动作：统一聊天/群聊的 BFF 请求、错误映射与 SSE 消费。

import { readChatStream, ChatStreamError, type ChatStreamHandlers, type ChatStreamUsage } from "@/lib/chat-events";

export type ChatRequestMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type ChatCompletionInput = {
  model: string;
  messages: ChatRequestMessage[];
  knowledge?: boolean;
  conversationId?: string;
  groupSchedule?: boolean;
  speakerId?: string;
  opening?: boolean;
  clientRequestId: string;
  traceId: string;
  signal?: AbortSignal;
};

export type ChatActionCode =
  | "unauthenticated"
  | "rate_limited"
  | "invalid"
  | "empty"
  | "unavailable"
  | "network";

export class ChatActionError extends Error {
  constructor(
    public readonly code: ChatActionCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ChatActionError";
  }
}

export type ChatStreamResult = {
  requestId: string;
  content: string;
  usage?: ChatStreamUsage;
  knowledgeHits: number | null;
};

export type GroupScheduleResult = {
  speakers: { id: string; name: string }[];
};

async function postChatCompletion(input: ChatCompletionInput, fetcher: typeof fetch): Promise<Response> {
  try {
    return await fetcher("/api/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Request-ID": input.clientRequestId,
        "X-Trace-ID": input.traceId,
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        knowledge: input.knowledge,
        conversationId: input.conversationId,
        groupSchedule: input.groupSchedule,
        speakerId: input.speakerId,
        opening: input.opening,
      }),
      signal: input.signal,
    });
  } catch {
    throw new ChatActionError("network", "网络请求失败。");
  }
}

function throwForResponse(response: Response, body: unknown): never {
  if (response.status === 401) throw new ChatActionError("unauthenticated", "登录会话已失效。", 401);
  if (response.status === 429) throw new ChatActionError("rate_limited", "请求过于频繁，请稍后再试。", 429);
  const message =
    body && typeof body === "object" && "error" in body && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error
      : "模型请求失败。";
  throw new ChatActionError(response.status >= 500 ? "unavailable" : "invalid", message, response.status);
}

export async function streamChatCompletion(
  input: ChatCompletionInput,
  handlers: ChatStreamHandlers,
  fetcher: typeof fetch = fetch,
): Promise<ChatStreamResult> {
  const response = await postChatCompletion(input, fetcher);
  const requestId = response.headers.get("x-request-id") || "";
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null);
    throwForResponse(response, body);
  }
  const knowledgeHits = Number(response.headers.get("x-yan-knowledge-hits") || 0);
  try {
    const result = await readChatStream(response, handlers);
    if (!result.content) throw new ChatActionError("empty", "模型未返回可显示内容。");
    return { requestId, ...result, knowledgeHits: knowledgeHits > 0 ? knowledgeHits : null };
  } catch (error) {
    if (error instanceof ChatStreamError) throw new ChatActionError("invalid", error.message);
    throw error;
  }
}

export async function requestGroupSchedule(
  input: ChatCompletionInput,
  fetcher: typeof fetch = fetch,
): Promise<GroupScheduleResult> {
  const response = await postChatCompletion({ ...input, groupSchedule: true }, fetcher);
  const body = (await response.json().catch(() => null)) as {
    speakers?: unknown;
    error?: string;
  } | null;
  if (!response.ok) throwForResponse(response, body);
  if (!Array.isArray(body?.speakers) || body.speakers.length === 0) {
    throw new ChatActionError("invalid", body?.error || "群聊调度失败，请稍后再试。", response.status);
  }
  const speakers = body.speakers as { id: string; name: string }[];
  if (!speakers.every((speaker) => typeof speaker.id === "string" && typeof speaker.name === "string")) {
    throw new ChatActionError("invalid", "群聊调度响应格式无效。", response.status);
  }
  return { speakers };
}
