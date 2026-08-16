import { NextRequest, NextResponse } from "next/server";
import { parseAiChatRequest } from "@/lib/chat";
import { resolveEmbeddingModel } from "@/lib/knowledge-embedding";
import type { ConversationDetail } from "@/lib/conversations";
import { createFileConversationRepository } from "@/lib/conversation-file-repository";
import { resolveRequestIds } from "@/lib/request-ids";
import { cookieOptions, isValidAiSession, SESSION_COOKIE, type AiSession, unseal } from "@/lib/session";
import { ChatV1Error, runChatV1 } from "@/workflows/chat-v1";
import { runRoleplayV1 } from "@/workflows/roleplay-v1";
import { runGroupScheduleV1, runGroupSpeakerV1 } from "@/workflows/group-v1";
import { createObservabilityHub } from "@/observability/port";
import { createJsonlObservabilityExporter } from "@/observability/jsonl-exporter";
import type { WorkflowEvent } from "@/domain/workflow-events";
import { createCapabilityAdapter } from "@/capabilities/adapters";
import { requestDedupe } from "@/lib/request-dedupe";

export type ChatHandlerConfig = {
  publicUrl: URL;
  sessionSecret: string;
  yanCoreApiBaseUrl: URL;
};

export async function handleChatCompletion(request: NextRequest, config: ChatHandlerConfig, fetcher: typeof fetch = fetch) {
  const observabilityPath = process.env.AI_WEB_OBSERVABILITY_FILE?.trim() || "/data/observability/events.jsonl";
  const observability = createObservabilityHub([createJsonlObservabilityExporter(observabilityPath)]);
  const emit = (conversationId?: string) => (event: WorkflowEvent) =>
    observability.sink({ ...event, conversationId });
  if (request.headers.get("origin") !== config.publicUrl.origin) {
    return NextResponse.json({ error: "请求来源无效。" }, { status: 403 });
  }
  const session = unseal<AiSession>(request.cookies.get(SESSION_COOKIE)?.value, config.sessionSecret);
  if (!isValidAiSession(session)) {
    const response = NextResponse.json({ error: "登录会话已失效。" }, { status: 401 });
    response.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
    return response;
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (!Number.isFinite(contentLength) || contentLength > 32 * 1024) {
    return NextResponse.json({ error: "请求内容过大。" }, { status: 413 });
  }
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 32 * 1024) {
    return NextResponse.json({ error: "请求内容过大。" }, { status: 413 });
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody || "null");
  } catch {
    return NextResponse.json({ error: "请求内容不是有效 JSON。" }, { status: 400 });
  }
  const parsed = parseAiChatRequest(body, session.credential.models);
  if (!parsed) return NextResponse.json({ error: "模型或消息格式无效。" }, { status: 400 });
  const ids = resolveRequestIds(
    request.headers.get("x-client-request-id"),
    request.headers.get("x-trace-id"),
  );
  const dedupeKey = request.headers.get("x-client-request-id")?.trim() || null;
  const beginDedupe = (): NextResponse | null => {
    if (!dedupeKey) return null;
    const check = requestDedupe.begin(dedupeKey);
    if (check.allowed) return null;
    return NextResponse.json(
      {
        error:
          check.status === "pending"
            ? "该请求正在处理中，请勿重复提交。"
            : "该请求已完成，请勿重复提交。",
        code: "DUPLICATE_REQUEST",
      },
      { status: 409 },
    );
  };
  const markBilled = (): void => {
    if (dedupeKey) requestDedupe.finish(dedupeKey, "billed");
  };
  const finishWithError = (error: unknown): void => {
    if (!dedupeKey) return;
    requestDedupe.finish(dedupeKey, error instanceof ChatV1Error ? "failed" : "unknown");
  };
  const duplicateResponse = beginDedupe();
  if (duplicateResponse) return duplicateResponse;
  const capabilityAdapter = createCapabilityAdapter({
    model: parsed.model,
    embeddingModel: resolveEmbeddingModel(session),
  });
  let knowledgeHits = 0;
  const candidate = body as Record<string, unknown> | null;
  let conversationDetail: ConversationDetail | null = null;
  if (typeof candidate?.conversationId === "string") {
    try {
      conversationDetail = await createFileConversationRepository().getDetail(
        session.subject.userId,
        candidate.conversationId,
      );
    } catch {
      // 会话不存在时退回普通对话，不阻断请求。
    }
  }
  if (!conversationDetail || conversationDetail.mode === "chat") {
    try {
      const response = await runChatV1({
        runId: `run_${ids.traceId}`,
        capabilityId: "text.chat.general",
        adapter: capabilityAdapter,
        messages: parsed.messages,
        accessKey: session.credential.accessKey,
        apiBaseUrl: config.yanCoreApiBaseUrl,
        signal: request.signal,
        traceId: ids.traceId,
        clientRequestId: ids.clientRequestId,
        onEvent: emit(conversationDetail?.id),
        fetcher,
      });
      markBilled();
      return response;
    } catch (error) {
      finishWithError(error);
      if (error instanceof ChatV1Error && error.code === "SESSION_REVOKED") {
        const revoked = NextResponse.json(
          { error: error.message, code: "SESSION_REVOKED" },
          { status: 401 },
        );
        revoked.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
        return revoked;
      }
      return NextResponse.json(
        { error: error instanceof ChatV1Error ? error.message : "模型服务暂时不可用。" },
        { status: error instanceof ChatV1Error ? error.status : 502 },
      );
    }
  }
  if (conversationDetail?.mode === "roleplay" && conversationDetail.persona) {
    const query = [...parsed.messages].reverse().find((message) => message.role === "user")?.content ?? "";
    try {
      const response = await runRoleplayV1({
        runId: `run_${ids.traceId}`,
        conversationId: conversationDetail.id,
        userId: session.subject.userId,
        persona: conversationDetail.persona,
        world: conversationDetail.world,
        history: conversationDetail.messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => ({ role: message.role, content: message.content })),
        query,
        capabilityId: "text.chat.general",
        adapter: capabilityAdapter,
        accessKey: session.credential.accessKey,
        apiBaseUrl: config.yanCoreApiBaseUrl,
        signal: request.signal,
        traceId: ids.traceId,
        clientRequestId: ids.clientRequestId,
        onEvent: emit(conversationDetail.id),
        fetcher,
      });
      markBilled();
      return response;
    } catch (error) {
      finishWithError(error);
      if (error instanceof ChatV1Error && error.code === "SESSION_REVOKED") {
        const revoked = NextResponse.json(
          { error: error.message, code: "SESSION_REVOKED" },
          { status: 401 },
        );
        revoked.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
        return revoked;
      }
      return NextResponse.json(
        { error: error instanceof ChatV1Error ? error.message : "模型服务暂时不可用。" },
        { status: error instanceof ChatV1Error ? error.status : 502 },
      );
    }
  }
  if (conversationDetail?.mode === "group" && conversationDetail.cast?.length) {
    const opening = candidate?.opening === true;
    const latestUserContent =
      [...parsed.messages].reverse().find((message) => message.role === "user")?.content ?? "";
    if (candidate?.groupSchedule === true) {
      try {
        const result = await runGroupScheduleV1({
          runId: `run_${ids.traceId}`,
          conversationId: conversationDetail.id,
          cast: conversationDetail.cast,
          director: conversationDetail.director,
          world: conversationDetail.world,
          userRole: conversationDetail.userRole,
          history: conversationDetail.messages,
          latestUserContent,
          opening,
          capabilityId: "text.chat.general",
          adapter: capabilityAdapter,
          accessKey: session.credential.accessKey,
          apiBaseUrl: config.yanCoreApiBaseUrl,
          signal: request.signal,
          traceId: ids.traceId,
          clientRequestId: ids.clientRequestId,
          onEvent: emit(conversationDetail.id),
          fetcher,
        });
        markBilled();
        const response = NextResponse.json({ speakers: result.speakers });
        response.headers.set("X-Trace-ID", ids.traceId);
        response.headers.set("X-Client-Request-ID", ids.clientRequestId);
        return response;
      } catch (error) {
        finishWithError(error);
        if (error instanceof ChatV1Error && error.code === "SESSION_REVOKED") {
          const revoked = NextResponse.json(
            { error: error.message, code: "SESSION_REVOKED" },
            { status: 401 },
          );
          revoked.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
          return revoked;
        }
        return NextResponse.json(
          { error: error instanceof ChatV1Error ? error.message : "群聊调度失败，请稍后再试。" },
          { status: error instanceof ChatV1Error ? error.status : 502 },
        );
      }
    }
    if (typeof candidate?.speakerId === "string") {
      const speaker = conversationDetail.cast.find((persona) => persona.id === candidate.speakerId);
      if (!speaker) return NextResponse.json({ error: "发言人不存在。" }, { status: 400 });
      try {
        const response = await runGroupSpeakerV1({
          runId: `run_${ids.traceId}`,
          conversationId: conversationDetail.id,
          userId: session.subject.userId,
          speaker,
          cast: conversationDetail.cast,
          director: conversationDetail.director,
          world: conversationDetail.world,
          userRole: conversationDetail.userRole,
          history: conversationDetail.messages,
          latestUserContent,
          opening,
          capabilityId: "text.chat.general",
          adapter: capabilityAdapter,
          accessKey: session.credential.accessKey,
          apiBaseUrl: config.yanCoreApiBaseUrl,
          signal: request.signal,
          traceId: ids.traceId,
          clientRequestId: ids.clientRequestId,
          onEvent: emit(conversationDetail.id),
          fetcher,
        });
        markBilled();
        return response;
      } catch (error) {
        finishWithError(error);
        if (error instanceof ChatV1Error && error.code === "SESSION_REVOKED") {
          const revoked = NextResponse.json(
            { error: error.message, code: "SESSION_REVOKED" },
            { status: 401 },
          );
          revoked.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
          return revoked;
        }
        return NextResponse.json(
          { error: error instanceof ChatV1Error ? error.message : `${speaker.name} 发言失败。` },
          { status: error instanceof ChatV1Error ? error.status : 502 },
        );
      }
    }
  }
  if (dedupeKey) requestDedupe.finish(dedupeKey, "failed");
  return NextResponse.json({ error: "模型服务暂时不可用。" }, { status: 502 });
}
