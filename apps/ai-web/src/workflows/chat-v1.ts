// chat/v1 工作流：普通聊天的最小步骤与事件发布。

import { forwardChatCompletion, type AiChatRequest } from "@/lib/chat";
import { runWorkflow } from "@/domain/workflow-runtime";
import type { WorkflowEvent } from "@/domain/workflow-events";
import type { CapabilityAdapter } from "@/capabilities/adapters";

export class ChatV1Error extends Error {
  constructor(
    public readonly code: "SESSION_REVOKED" | "GATEWAY_ERROR",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ChatV1Error";
  }
}

export type ChatV1Input = {
  runId: string;
  conversationId?: string;
  capabilityId: string;
  adapter: CapabilityAdapter;
  messages: AiChatRequest["messages"];
  accessKey: string;
  apiBaseUrl: URL;
  signal?: AbortSignal;
  traceId: string;
  clientRequestId: string;
  onEvent: (event: WorkflowEvent) => void;
  fetcher?: typeof fetch;
};

export async function runChatV1(input: ChatV1Input): Promise<Response> {
  let output: Response | undefined;
  await runWorkflow({
    workflowId: "chat/v1",
    version: "1.0.0",
    runId: input.runId,
    traceId: input.traceId,
    clientRequestId: input.clientRequestId,
    signal: input.signal,
    timeoutMs: 180_000,
    onEvent: input.onEvent,
    steps: [
      {
        id: "chat.text.stream",
        run: async (context) => {
          context.emit("capability", "started", { capabilityId: "text.chat.general" });
          const model = input.adapter.resolveModel(input.capabilityId);
          const upstream = await forwardChatCompletion(
            input.apiBaseUrl,
            input.accessKey,
            { model, messages: input.messages },
            input.fetcher,
            context.signal,
            { clientRequestId: input.clientRequestId, traceId: input.traceId },
          );
          if (upstream.status === 401 || upstream.status === 403) {
            await upstream.body?.cancel();
            throw new ChatV1Error("SESSION_REVOKED", "登录会话已失效或已被撤销。", 401);
          }
          if (!upstream.ok) {
            await upstream.body?.cancel();
            const body = (await upstream.json().catch(() => null)) as { error?: unknown } | null;
            const message =
              body && typeof body.error === "string" ? body.error : "模型服务暂时不可用。";
            throw new ChatV1Error("GATEWAY_ERROR", message, upstream.status);
          }
          const headers = new Headers(upstream.headers);
          headers.set("Cache-Control", "no-store");
          headers.set("X-Content-Type-Options", "nosniff");
          headers.set("X-Trace-ID", input.traceId);
          headers.set("X-Client-Request-ID", input.clientRequestId);
          output = new Response(upstream.body, { status: upstream.status, headers });
          context.emit("capability", "completed", {
            capabilityId: "text.chat.general",
            requestId: upstream.headers.get("x-request-id") ?? undefined,
          });
        },
      },
    ],
  });
  if (!output) throw new ChatV1Error("GATEWAY_ERROR", "chat/v1 未产生输出。", 502);
  return output;
}
