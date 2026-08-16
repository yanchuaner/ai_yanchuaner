// group/v1 工作流：调度步骤与每位角色的独立发言步骤。

import type { AiChatMessage, AiChatRequest } from "@/lib/chat";
import { forwardChatCompletion, forwardChatCompletionJson } from "@/lib/chat";
import { requestEmbeddings } from "@/lib/embedding";
import {
  buildGroupSpeakerPrompt,
  buildKnowledgePrompt,
  buildSchedulerPrompt,
  buildWorldPrompt,
  dedupeHits,
  ensureLatestUser,
  formatGroupHistory,
  parseSpeakerNames,
  pickFallbackSpeakers,
} from "@/workflows/group-prompts";
import { createFileKnowledgeRepository } from "@/lib/knowledge-file-repository";
import { createFileMemoryRepository } from "@/lib/memory-file-repository";
import { runWorkflow } from "@/domain/workflow-runtime";
import type { WorkflowEvent } from "@/domain/workflow-events";
import { ChatV1Error } from "@/workflows/chat-v1";
import type { ConversationDetail, StoredMessage } from "@/lib/conversations";
import type { Persona } from "@/lib/personas";
import type { CapabilityAdapter } from "@/capabilities/adapters";

export type GroupScheduleV1Input = {
  runId: string;
  conversationId: string;
  cast: Persona[];
  director?: Persona;
  world?: ConversationDetail["world"];
  userRole?: ConversationDetail["userRole"];
  history: StoredMessage[];
  latestUserContent: string;
  opening: boolean;
  capabilityId: string;
  adapter: CapabilityAdapter;
  accessKey: string;
  apiBaseUrl: URL;
  signal?: AbortSignal;
  traceId: string;
  clientRequestId: string;
  onEvent: (event: WorkflowEvent) => void;
  fetcher?: typeof fetch;
};

export async function runGroupScheduleV1(input: GroupScheduleV1Input): Promise<{ speakers: { id: string; name: string }[] }> {
  let speakers: { id: string; name: string }[] = [];
  const model = input.adapter.resolveModel(input.capabilityId);
  await runWorkflow({
    workflowId: "group/v1",
    version: "1.0.0",
    runId: input.runId,
    traceId: input.traceId,
    clientRequestId: input.clientRequestId,
    signal: input.signal,
    timeoutMs: 60_000,
    onEvent: input.onEvent,
    steps: [
      {
        id: "group.schedule",
        run: async (context) => {
          context.emit("capability", "started", { capabilityId: "group.scheduler" });
          const history = input.opening ? input.history : ensureLatestUser(input.history, {
            model,
            messages: [{ role: "user", content: input.latestUserContent }],
          } as AiChatRequest);
          const schedulerMessages: AiChatMessage[] = [
            {
              role: "system",
              content: buildSchedulerPrompt(input.cast, input.director, input.world, input.userRole),
            },
            ...formatGroupHistory(history, input.cast, input.userRole?.name).slice(-16),
          ];
          if (input.opening && !history.some((message) => message.role === "user")) {
            schedulerMessages.push({
              role: "user",
              content: "（群聊刚开始，请选择 1 到 2 位成员做简短自然的开场介绍，不需要所有成员都开口。）",
            });
          }
          const schedulerResponse = await forwardChatCompletionJson(
            input.apiBaseUrl,
            input.accessKey,
            { model, messages: schedulerMessages },
            input.fetcher,
            context.signal,
            { clientRequestId: input.clientRequestId, traceId: input.traceId },
          );
          if (schedulerResponse.status === 401 || schedulerResponse.status === 403) {
            throw new ChatV1Error("SESSION_REVOKED", "登录会话已失效或已被撤销。", 401);
          }
          if (schedulerResponse.status !== 200) {
            throw new ChatV1Error("GATEWAY_ERROR", "群聊调度失败，请稍后再试。", schedulerResponse.status);
          }
          const body = schedulerResponse.body as
            | { choices?: { message?: { content?: unknown } }[] }
            | null
            | undefined;
          const excluded = input.director ? new Set([input.director.id]) : new Set<string>();
          const candidates = input.cast.filter((persona) => !excluded.has(persona.id));
          const parsed = body
            ? parseSpeakerNames(body.choices?.[0]?.message?.content, candidates)
            : [];
          const selected = parsed.length > 0 ? parsed.slice(0, 2) : pickFallbackSpeakers(candidates);
          speakers = selected.map((persona) => ({ id: persona.id, name: persona.name }));
          context.emit("capability", "completed", { capabilityId: "group.scheduler" });
        },
      },
    ],
  });
  return { speakers };
}

export type GroupSpeakerV1Input = {
  runId: string;
  conversationId: string;
  userId: number;
  speaker: Persona;
  cast: Persona[];
  director?: Persona;
  world?: ConversationDetail["world"];
  userRole?: ConversationDetail["userRole"];
  history: StoredMessage[];
  latestUserContent: string;
  opening: boolean;
  capabilityId: string;
  adapter: CapabilityAdapter;
  accessKey: string;
  apiBaseUrl: URL;
  signal?: AbortSignal;
  traceId: string;
  clientRequestId: string;
  onEvent: (event: WorkflowEvent) => void;
  fetcher?: typeof fetch;
};

export async function runGroupSpeakerV1(input: GroupSpeakerV1Input): Promise<Response> {
  let messages: AiChatMessage[] = [];
  let output: Response | undefined;
  let knowledgeHitCount = 0;
  const model = input.adapter.resolveModel(input.capabilityId);
  const embeddingModel = input.adapter.resolveEmbeddingModel?.() ?? null;
  await runWorkflow({
    workflowId: "group/v1",
    version: "1.0.0",
    runId: input.runId,
    traceId: input.traceId,
    clientRequestId: input.clientRequestId,
    signal: input.signal,
    timeoutMs: 180_000,
    onEvent: input.onEvent,
    steps: [
      {
        id: "group.context.build",
        run: async (context) => {
          const history = input.opening ? input.history : ensureLatestUser(input.history, {
            model,
            messages: [{ role: "user", content: input.latestUserContent }],
          } as AiChatRequest);
          const query = [...history].reverse().find((message) => message.role === "user")?.content ?? "";
          const systemBlocks = [
            buildGroupSpeakerPrompt(input.speaker, input.cast, input.director, input.world, input.userRole),
          ];
          if (input.opening && history.length === 0) {
            systemBlocks.push(
              "这是群聊的开场：请用 1 到 2 句话做简短自然的自我介绍或问候，可以称呼在场的其他成员，不要长篇大论。",
            );
          }
          try {
            const memory = await createFileMemoryRepository().get(input.userId, input.speaker.id);
            if (memory?.summary) systemBlocks.push(`【角色长期记忆】\n${memory.summary}`);
          } catch (error) {
            context.emit("step", "degraded", {
              stepId: "group.context.build",
              errorCode: "memory_unavailable",
              message: error instanceof Error ? error.message : "长期记忆不可用。",
            });
          }
          if (query && embeddingModel) {
            try {
              const embedded = await requestEmbeddings(
                input.apiBaseUrl,
                input.accessKey,
                embeddingModel,
                [query],
                input.fetcher,
              );
              const threshold = input.adapter.resolveKnowledgeThreshold?.() ?? 0.3;
              const repository = createFileKnowledgeRepository();
              const [personaHits, userHits] = await Promise.all([
                repository.search(input.userId, input.speaker.id, embedded.vectors[0], 3, threshold),
                repository.search(input.userId, null, embedded.vectors[0], 2, threshold),
              ]);
              const hits = dedupeHits([...personaHits, ...userHits]).slice(0, 4);
              if (hits.length > 0) {
                systemBlocks.push(buildKnowledgePrompt(hits));
                knowledgeHitCount = hits.length;
              }
            } catch (error) {
              context.emit("step", "degraded", {
                stepId: "group.context.build",
                errorCode: "knowledge_unavailable",
                message: error instanceof Error ? error.message : "资料检索不可用。",
              });
            }
          }
          context.emit("step", "completed", { stepId: "group.context.build" });
          messages = [
            { role: "system", content: systemBlocks.join("\n\n").slice(0, 12_000) },
            ...formatGroupHistory(history, input.cast, input.userRole?.name),
          ];
        },
      },
      {
        id: "chat.text.stream",
        run: async (context) => {
          context.emit("capability", "started", { capabilityId: "text.chat.general" });
          const upstream = await forwardChatCompletion(
            input.apiBaseUrl,
            input.accessKey,
            { model, messages },
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
            throw new ChatV1Error(
              "GATEWAY_ERROR",
              body && typeof body.error === "string" ? body.error : "模型服务暂时不可用。",
              upstream.status,
            );
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
  if (!output) throw new ChatV1Error("GATEWAY_ERROR", "group/v1 未产生输出。", 502);
  return output;
}
