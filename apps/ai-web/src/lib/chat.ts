export type AiChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiChatRequest = {
  model: string;
  messages: AiChatMessage[];
};

export function parseAiChatRequest(raw: unknown, allowedModels: string[]): AiChatRequest | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const candidate = raw as { model?: unknown; messages?: unknown };
  if (typeof candidate.model !== "string" || !allowedModels.includes(candidate.model)) return null;
  if (!Array.isArray(candidate.messages) || candidate.messages.length === 0 || candidate.messages.length > 64) return null;
  let totalLength = 0;
  const messages: AiChatMessage[] = [];
  for (const item of candidate.messages) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const message = item as { role?: unknown; content?: unknown };
    if (!(["system", "user", "assistant"] as unknown[]).includes(message.role) || typeof message.content !== "string") return null;
    if (message.content.length === 0 || message.content.length > 16_000) return null;
    totalLength += message.content.length;
    if (totalLength > 32_000) return null;
    messages.push({ role: message.role as AiChatMessage["role"], content: message.content });
  }
  return { model: candidate.model, messages };
}

export async function forwardChatCompletion(
  apiBaseUrl: URL,
  accessKey: string,
  request: AiChatRequest,
  fetcher: typeof fetch = fetch,
  clientSignal?: AbortSignal,
): Promise<Response> {
  const endpoint = new URL("/v1/chat/completions", apiBaseUrl);
  const upstream = await fetcher(endpoint, {
    method: "POST",
    cache: "no-store",
    redirect: "error",
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${accessKey}`,
      "Content-Type": "application/json",
      "X-YanCore-Application": "ai-web",
    },
    body: JSON.stringify({ ...request, stream: true }),
    signal: clientSignal
      ? AbortSignal.any([clientSignal, AbortSignal.timeout(120_000)])
      : AbortSignal.timeout(120_000),
  });
  const contentType = upstream.headers.get("content-type") || "";
  if (upstream.ok && !contentType.toLowerCase().startsWith("text/event-stream")) {
    await upstream.body?.cancel();
    return Response.json({ error: "模型服务未返回流式响应。" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": contentType || "application/json",
    "X-Content-Type-Options": "nosniff",
  });
  const requestId = upstream.headers.get("x-request-id") || upstream.headers.get("x-oneapi-request-id");
  if (requestId) headers.set("X-Request-ID", requestId);
  return new Response(upstream.body, { status: upstream.status, headers });
}
