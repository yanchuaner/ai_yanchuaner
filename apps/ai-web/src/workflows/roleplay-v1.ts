// roleplay/v1 工作流：独立上下文贡献者 + 文本能力步骤。

import type { AiChatMessage } from "@/lib/chat";
import { forwardChatCompletion } from "@/lib/chat";
import { requestEmbeddings } from "@/lib/embedding";
import { searchPersonaKnowledge, searchUserKnowledge } from "@/lib/knowledge-library";
import { getPersonaMemory } from "@/lib/memory-library";
import { runWorkflow } from "@/domain/workflow-runtime";
import type { WorkflowEvent } from "@/domain/workflow-events";
import { ChatV1Error } from "@/workflows/chat-v1";
import {
  assembleContext,
  historyContributor,
  knowledgeContributor,
  memoryContributor,
  personaSnapshotContributor,
  systemPolicyContributor,
  worldSnapshotContributor,
  type ContextAssembleResult,
  type ContextContribution,
} from "@/workflows/context";
import type { Persona } from "@/lib/personas";

export type RoleplayV1Input = {
  runId: string;
  conversationId?: string;
  userId: number;
  persona: Persona;
  world?: { snapshot: { title: string; description: string; timeline: string; outline: string } };
  history: AiChatMessage[];
  query: string;
  model: string;
  embeddingModel?: string | null;
  accessKey: string;
  apiBaseUrl: URL;
  signal?: AbortSignal;
  traceId: string;
  clientRequestId: string;
  onEvent: (event: WorkflowEvent) => void;
  fetcher?: typeof fetch;
};

export async function runRoleplayV1(input: RoleplayV1Input): Promise<Response> {
  let assembled: ContextAssembleResult | undefined;
  let knowledgeHitCount = 0;
  let output: Response | undefined;
  await runWorkflow({
    workflowId: "roleplay/v1",
    version: "1.0.0",
    runId: input.runId,
    traceId: input.traceId,
    clientRequestId: input.clientRequestId,
    signal: input.signal,
    timeoutMs: 180_000,
    onEvent: input.onEvent,
    steps: [
      {
        id: "roleplay.context.build",
        run: async (context) => {
          const contributions: ContextContribution[] = [
            systemPolicyContributor(),
            personaSnapshotContributor(input.persona),
            historyContributor(input.history),
          ];
          const world = worldSnapshotContributor(input.world);
          if (world) contributions.push(world);

          try {
            const memory = await getPersonaMemory(input.userId, input.persona.id);
            const contribution = memoryContributor(memory);
            if (contribution) contributions.push(contribution);
          } catch (error) {
            context.emit("step", "degraded", {
              stepId: "roleplay.context.build",
              errorCode: "memory_unavailable",
              message: error instanceof Error ? error.message : "长期记忆不可用。",
            });
          }

          if (input.query && input.embeddingModel) {
            try {
              const embedded = await requestEmbeddings(
                input.apiBaseUrl,
                input.accessKey,
                input.embeddingModel,
                [input.query],
                input.fetcher,
              );
              const threshold = Number(process.env.AI_WEB_KNOWLEDGE_THRESHOLD || 0.3);
              const safeThreshold = Number.isFinite(threshold) ? threshold : 0.3;
              const [personaHits, userHits] = await Promise.all([
                searchPersonaKnowledge(input.userId, input.persona.id, embedded.vectors[0], 4, safeThreshold),
                searchUserKnowledge(input.userId, embedded.vectors[0], 2, safeThreshold),
              ]);
              const contribution = knowledgeContributor([...personaHits, ...userHits].slice(0, 4));
              if (contribution) {
                contributions.push(contribution);
                knowledgeHitCount = [...personaHits, ...userHits].length;
              }
            } catch (error) {
              context.emit("step", "degraded", {
                stepId: "roleplay.context.build",
                errorCode: "knowledge_unavailable",
                message: error instanceof Error ? error.message : "资料检索不可用。",
              });
            }
          }

          assembled = assembleContext(contributions);
          context.emit("step", "completed", { stepId: "roleplay.context.build" });
        },
      },
      {
        id: "chat.text.stream",
        run: async (context) => {
          context.emit("capability", "started", { capabilityId: "text.chat.general" });
          const messages: AiChatMessage[] = [
            ...(assembled?.blocks ?? []).map((content) => ({ role: "system" as const, content })),
            { role: "user", content: input.query },
          ];
          const upstream = await forwardChatCompletion(
            input.apiBaseUrl,
            input.accessKey,
            { model: input.model, messages },
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
          if (knowledgeHitCount > 0) headers.set("X-Yan-Knowledge-Hits", String(knowledgeHitCount));
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
  if (!output) throw new ChatV1Error("GATEWAY_ERROR", "roleplay/v1 未产生输出。", 502);
  return output;
}
