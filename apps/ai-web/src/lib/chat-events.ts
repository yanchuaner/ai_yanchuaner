// SSE 聊天事件：把原始流式行转换为类型化事件，页面不直接解析 data: 文本。

export type ChatStreamUsage = {
  prompt?: number;
  completion?: number;
};

export type ChatChunkEvent =
  | { type: "delta"; content: string }
  | { type: "usage"; usage: ChatStreamUsage }
  | { type: "error"; message: string }
  | { type: "done" }
  | { type: "unknown" };

export class ChatStreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatStreamError";
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

export function parseChatChunk(data: string): ChatChunkEvent {
  const trimmed = data.trim();
  if (trimmed === "[DONE]") return { type: "done" };
  if (!trimmed) return { type: "unknown" };
  let chunk: unknown;
  try {
    chunk = JSON.parse(trimmed);
  } catch {
    return { type: "unknown" };
  }
  if (!isRecord(chunk)) return { type: "unknown" };
  if (isRecord(chunk.error) && typeof chunk.error.message === "string") {
    return { type: "error", message: chunk.error.message };
  }
  if (isRecord(chunk.usage)) {
    return {
      type: "usage",
      usage: {
        prompt: typeof chunk.usage.prompt_tokens === "number" ? chunk.usage.prompt_tokens : undefined,
        completion:
          typeof chunk.usage.completion_tokens === "number" ? chunk.usage.completion_tokens : undefined,
      },
    };
  }
  const choices = chunk.choices;
  const delta =
    Array.isArray(choices) &&
    choices.length > 0 &&
    isRecord(choices[0]) &&
    isRecord(choices[0].delta)
      ? choices[0].delta.content
      : undefined;
  if (typeof delta === "string") {
    return delta ? { type: "delta", content: delta } : { type: "unknown" };
  }
  return { type: "unknown" };
}

export type ChatStreamHandlers = {
  onDelta(content: string): void;
  onUsage?(usage: ChatStreamUsage): void;
};

export async function readChatStream(
  response: Response,
  handlers: ChatStreamHandlers,
): Promise<{ content: string; usage?: ChatStreamUsage }> {
  if (!response.body) throw new ChatStreamError("模型未返回流式响应。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let usage: ChatStreamUsage | undefined;

  const processBlock = (block: string) => {
    for (const line of block.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const event = parseChatChunk(line.slice(5));
      if (event.type === "delta") {
        content += event.content;
        handlers.onDelta(event.content);
      } else if (event.type === "usage") {
        usage = event.usage;
        handlers.onUsage?.(event.usage);
      } else if (event.type === "error") {
        throw new ChatStreamError(event.message);
      }
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: !done });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) processBlock(block);
  }
  if (buffer.trim()) processBlock(buffer);
  return { content, usage };
}
