import { NextRequest, NextResponse } from "next/server";
import {
  forwardChatCompletion,
  forwardChatCompletionJson,
  parseAiChatRequest,
  type AiChatMessage,
  type AiChatRequest,
} from "@/lib/chat";
import { requestEmbeddings } from "@/lib/embedding";
import { resolveEmbeddingModel } from "@/lib/knowledge-embedding";
import {
  getConversationDetail,
  type ConversationDetail,
  type StoredMessage,
} from "@/lib/conversations";
import {
  searchPersonaKnowledge,
  searchUserKnowledge,
  type KnowledgeHit,
} from "@/lib/knowledge-library";
import { getPersonaMemory } from "@/lib/memory-library";
import type { Persona } from "@/lib/personas";
import { resolveRequestIds, type RequestIdBundle } from "@/lib/request-ids";
import { cookieOptions, isValidAiSession, SESSION_COOKIE, type AiSession, unseal } from "@/lib/session";
import { ChatV1Error, runChatV1 } from "@/workflows/chat-v1";
import { runRoleplayV1 } from "@/workflows/roleplay-v1";
import { runGroupScheduleV1, runGroupSpeakerV1 } from "@/workflows/group-v1";

export type ChatHandlerConfig = {
  publicUrl: URL;
  sessionSecret: string;
  yanCoreApiBaseUrl: URL;
};

export async function handleChatCompletion(request: NextRequest, config: ChatHandlerConfig, fetcher: typeof fetch = fetch) {
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
  let knowledgeHits = 0;
  const candidate = body as Record<string, unknown> | null;
  let conversationDetail: ConversationDetail | null = null;
  if (typeof candidate?.conversationId === "string") {
    try {
      conversationDetail = await getConversationDetail(session.subject.userId, candidate.conversationId);
    } catch {
      // 会话不存在时退回普通对话，不阻断请求。
    }
  }
  if (!conversationDetail || conversationDetail.mode === "chat") {
    try {
      return await runChatV1({
        runId: `run_${ids.traceId}`,
        model: parsed.model,
        messages: parsed.messages,
        accessKey: session.credential.accessKey,
        apiBaseUrl: config.yanCoreApiBaseUrl,
        signal: request.signal,
        traceId: ids.traceId,
        clientRequestId: ids.clientRequestId,
        onEvent: () => {},
        fetcher,
      });
    } catch (error) {
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
      return await runRoleplayV1({
        runId: `run_${ids.traceId}`,
        conversationId: conversationDetail.id,
        userId: session.subject.userId,
        persona: conversationDetail.persona,
        world: conversationDetail.world,
        history: conversationDetail.messages
          .filter((message) => message.role === "user" || message.role === "assistant")
          .map((message) => ({ role: message.role, content: message.content })),
        query,
        model: parsed.model,
        embeddingModel: resolveEmbeddingModel(session),
        accessKey: session.credential.accessKey,
        apiBaseUrl: config.yanCoreApiBaseUrl,
        signal: request.signal,
        traceId: ids.traceId,
        clientRequestId: ids.clientRequestId,
        onEvent: () => {},
        fetcher,
      });
    } catch (error) {
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
          model: parsed.model,
          accessKey: session.credential.accessKey,
          apiBaseUrl: config.yanCoreApiBaseUrl,
          signal: request.signal,
          traceId: ids.traceId,
          clientRequestId: ids.clientRequestId,
          onEvent: () => {},
          fetcher,
        });
        const response = NextResponse.json({ speakers: result.speakers });
        response.headers.set("X-Trace-ID", ids.traceId);
        response.headers.set("X-Client-Request-ID", ids.clientRequestId);
        return response;
      } catch (error) {
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
        return await runGroupSpeakerV1({
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
          model: parsed.model,
          embeddingModel: resolveEmbeddingModel(session),
          accessKey: session.credential.accessKey,
          apiBaseUrl: config.yanCoreApiBaseUrl,
          signal: request.signal,
          traceId: ids.traceId,
          clientRequestId: ids.clientRequestId,
          onEvent: () => {},
          fetcher,
        });
      } catch (error) {
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
  } else {
    // 非群聊会话继续走原有对话流程。
  }
  if (candidate?.knowledge === true && conversationDetail) {
    try {
      const detail = conversationDetail;
      const persona = detail.persona;
      const query = [...parsed.messages].reverse().find((message) => message.role === "user")?.content;
      if (persona && query) {
        const injections: { role: "system"; content: string }[] = [];
        if (persona) {
          const memory = await getPersonaMemory(session.subject.userId, persona.id).catch(() => null);
          if (memory?.summary) {
            injections.push({ role: "system", content: `【角色长期记忆】\n${memory.summary}` });
          }
        }
        const embeddingModel = resolveEmbeddingModel(session);
        if (embeddingModel) {
          const embedded = await requestEmbeddings(
            config.yanCoreApiBaseUrl,
            session.credential.accessKey,
            embeddingModel,
            [query],
            fetcher,
          );
          const threshold = Number(process.env.AI_WEB_KNOWLEDGE_THRESHOLD || 0.3);
          const userHits = await searchUserKnowledge(
            session.subject.userId,
            embedded.vectors[0],
            4,
            Number.isFinite(threshold) ? threshold : 0.3,
          );
          const personaHits = await searchPersonaKnowledge(
            session.subject.userId,
            persona.id,
            embedded.vectors[0],
            4,
            Number.isFinite(threshold) ? threshold : 0.3,
          );
          const hits = dedupeHits([...personaHits, ...userHits]).slice(0, 4);
          if (hits.length > 0) {
            injections.push({ role: "system", content: buildKnowledgePrompt(hits) });
            knowledgeHits = hits.length;
          }
        }
        for (const injection of injections.reverse()) {
          parsed.messages.unshift(injection);
        }
      }
    } catch {
      // 知识库故障不阻断聊天，退回普通对话。
    }
  }
  try {
    const upstream = await forwardChatCompletion(
      config.yanCoreApiBaseUrl,
      session.credential.accessKey,
      parsed,
      fetcher,
      request.signal,
      ids,
    );
    if (upstream.status === 401 || upstream.status === 403) {
      await upstream.body?.cancel();
      const revoked = NextResponse.json(
        { error: "登录会话已失效或已被撤销。", code: "SESSION_REVOKED" },
        { status: 401 },
      );
      revoked.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
      return revoked;
    }
    if (knowledgeHits > 0) {
      const headers = new Headers(upstream.headers);
      headers.set("X-Yan-Knowledge-Hits", String(knowledgeHits));
      return new Response(upstream.body, { status: upstream.status, headers });
    }
    return upstream;
  } catch {
    return NextResponse.json({ error: "模型服务暂时不可用。" }, { status: 502 });
  }
}

async function handleGroupSchedule(
  request: NextRequest,
  config: ChatHandlerConfig,
  session: AiSession,
  parsed: AiChatRequest,
  detail: ConversationDetail,
  fetcher: typeof fetch,
  opening: boolean,
  ids: RequestIdBundle,
): Promise<Response> {
  const cast = detail.cast ?? [];
  const history = opening ? detail.messages : ensureLatestUser(detail.messages, parsed);
  const schedulerMessages: AiChatMessage[] = [
    { role: "system", content: buildSchedulerPrompt(cast, detail.director, detail.world, detail.userRole) },
    ...formatGroupHistory(history, cast, detail.userRole?.name).slice(-16),
  ];
  if (opening && !history.some((message) => message.role === "user")) {
    schedulerMessages.push({
      role: "user",
      content: "（群聊刚开始，请选择 1 到 2 位成员做简短自然的开场介绍，不需要所有成员都开口。）",
    });
  }
  const schedulerResponse = await forwardChatCompletionJson(
    config.yanCoreApiBaseUrl,
    session.credential.accessKey,
    { model: parsed.model, messages: schedulerMessages },
    fetcher,
    request.signal,
    ids,
  );
  if (schedulerResponse.status === 401 || schedulerResponse.status === 403) {
    const revoked = NextResponse.json(
      { error: "登录会话已失效或已被撤销。", code: "SESSION_REVOKED" },
      { status: 401 },
    );
    revoked.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
    return revoked;
  }
  const schedulerBody =
    schedulerResponse.status === 200
      ? (schedulerResponse.body as
          | { choices?: { message?: { content?: unknown } }[] }
          | null
          | undefined)
      : null;
  // 主持人只营造场景，即使同时出现在成员列表里也不得发言。
  const excluded = detail.director ? new Set([detail.director.id]) : new Set<string>();
  const candidates = cast.filter((persona) => !excluded.has(persona.id));
  const speakers = schedulerBody
    ? parseSpeakerNames(schedulerBody.choices?.[0]?.message?.content, candidates)
    : [];
  const selectedSpeakers = speakers.length > 0 ? speakers.slice(0, 2) : pickFallbackSpeakers(candidates);
  const response = NextResponse.json({
    speakers: selectedSpeakers.map((persona) => ({ id: persona.id, name: persona.name })),
  });
  response.headers.set("X-Trace-ID", ids.traceId);
  response.headers.set("X-Client-Request-ID", ids.clientRequestId);
  return response;
}

async function handleGroupSpeaker(
  request: NextRequest,
  config: ChatHandlerConfig,
  session: AiSession,
  parsed: AiChatRequest,
  detail: ConversationDetail,
  speakerId: string,
  fetcher: typeof fetch,
  opening: boolean,
  ids: RequestIdBundle,
): Promise<Response> {
  const cast = detail.cast ?? [];
  const speaker = cast.find((persona) => persona.id === speakerId);
  if (!speaker) return NextResponse.json({ error: "发言人不存在。" }, { status: 400 });
  const history = opening ? detail.messages : ensureLatestUser(detail.messages, parsed);
  const query = [...history].reverse().find((message) => message.role === "user")?.content ?? "";
  let userHits: KnowledgeHit[] = [];
  let personaHits: KnowledgeHit[] = [];
  const embeddingModel = resolveEmbeddingModel(session);
  if (embeddingModel && query) {
    try {
      const embedded = await requestEmbeddings(
        config.yanCoreApiBaseUrl,
        session.credential.accessKey,
        embeddingModel,
        [query],
        fetcher,
      );
      const threshold = Number(process.env.AI_WEB_KNOWLEDGE_THRESHOLD || 0.3);
      const safeThreshold = Number.isFinite(threshold) ? threshold : 0.3;
      userHits = await searchUserKnowledge(session.subject.userId, embedded.vectors[0], 2, safeThreshold);
      personaHits = await searchPersonaKnowledge(
        session.subject.userId,
        speaker.id,
        embedded.vectors[0],
        3,
        safeThreshold,
      );
    } catch {
      // 知识库故障不阻断群聊。
    }
  }

  const systemBlocks = [
    buildGroupSpeakerPrompt(speaker, cast, detail.director, detail.world, detail.userRole),
  ];
  if (opening && history.length === 0) {
    systemBlocks.push(
      "这是群聊的开场：请用 1 到 2 句话做简短自然的自我介绍或问候，可以称呼在场的其他成员，不要长篇大论。",
    );
  }
  const memory = await getPersonaMemory(session.subject.userId, speaker.id).catch(() => null);
  if (memory?.summary) systemBlocks.push(`【角色长期记忆】\n${memory.summary}`);
  const hits = dedupeHits([...personaHits, ...userHits]).slice(0, 4);
  if (hits.length > 0) systemBlocks.push(buildKnowledgePrompt(hits));
  const upstream = await forwardChatCompletion(
    config.yanCoreApiBaseUrl,
    session.credential.accessKey,
    {
      model: parsed.model,
      messages: [
        { role: "system", content: systemBlocks.join("\n\n").slice(0, 12_000) },
        ...formatGroupHistory(history, cast, detail.userRole?.name),
      ],
    },
    fetcher,
    request.signal,
    ids,
  );
  if (upstream.status === 401 || upstream.status === 403) {
    await upstream.body?.cancel();
    const revoked = NextResponse.json(
      { error: "登录会话已失效或已被撤销。", code: "SESSION_REVOKED" },
      { status: 401 },
    );
    revoked.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
    return revoked;
  }
  const headers = new Headers(upstream.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Trace-ID", ids.traceId);
  headers.set("X-Client-Request-ID", ids.clientRequestId);
  return new Response(upstream.body, { status: upstream.status, headers });
}

export function ensureLatestUser(history: StoredMessage[], parsed: AiChatRequest): StoredMessage[] {
  if ([...history].reverse().some((message) => message.role === "user")) return history;
  const fallback = [...parsed.messages].reverse().find((message) => message.role === "user")?.content;
  if (!fallback) return history;
  return [...history, { id: `pending-${Date.now()}`, role: "user", content: fallback }];
}

export function buildSchedulerPrompt(
  cast: Persona[],
  director?: Persona,
  world?: ConversationDetail["world"],
  userRole?: ConversationDetail["userRole"],
): string {
  const lines = [
    "你是多人群聊的调度器，只决定本轮由谁发言，不参与对话，也不要生成任何台词。",
    "",
    "群聊成员：",
    ...cast.map((persona) => `- ${persona.name}：${persona.description.slice(0, 120)}`),
  ];
  if (director) {
    lines.push(
      "",
      `主持人（只营造场景氛围，不发言）：${director.name}`,
      director.description.slice(0, 200),
    );
  }
  if (world) {
    lines.push("", buildWorldPrompt(world));
  }
  if (userRole) {
    lines.push("", `用户当前扮演：${userRole.name}${userRole.description ? `（${userRole.description.slice(0, 200)}）` : ""}`);
  }
  lines.push(
    "",
    "根据用户消息和剧情需要，选择 1 到 2 位最合适的成员发言：",
    "- 只有一位成员适合回应时，只选 1 位；",
    "- 多位成员都在场且都能自然回应时，最多选 2 位；",
    "- 某位成员正在讲述一个话题、用户追问该话题时，只让该成员回应；",
    "- 主持人绝不发言，即使主持人名字出现在成员信息里也不能选；",
    "- 用户消息明确点名某位成员时，只选择被点名的成员；",
    "- 不要编造成员名称。",
    "",
    '只输出 JSON，不要解释：{"speakers":["成员A"]} 或 {"speakers":["成员A","成员B"]}',
  );
  return lines.join("\n");
}

export function parseSpeakerNames(raw: unknown, cast: Persona[]): Persona[] {
  let speakers: unknown[] = [];
  if (typeof raw === "string") {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]) as { speakers?: unknown };
        if (Array.isArray(parsed.speakers)) speakers = parsed.speakers;
      } catch {
        // 解析失败走回退。
      }
    }
  } else if (raw && typeof raw === "object") {
    const candidate = raw as { speakers?: unknown };
    if (Array.isArray(candidate.speakers)) speakers = candidate.speakers;
  }
  const selected: Persona[] = [];
  for (const item of speakers) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    if (!name) continue;
    const persona =
      cast.find((candidate) => candidate.name === name) ??
      cast.find((candidate) => name.startsWith(candidate.name) || candidate.name.startsWith(name));
    if (persona && !selected.some((picked) => picked.id === persona.id)) selected.push(persona);
    if (selected.length >= 2) break;
  }
  return selected;
}

export function pickFallbackSpeakers(cast: Persona[]): Persona[] {
  const pool = [...cast];
  const first = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  if (!first) return [];
  const second =
    pool.length > 0 && Math.random() < 0.5
      ? pool.splice(Math.floor(Math.random() * pool.length), 1)[0]
      : undefined;
  return second ? [first, second] : [first];
}

export function formatGroupHistory(
  messages: StoredMessage[],
  cast: Persona[],
  userRoleName?: string,
): AiChatMessage[] {
  const lines = messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => {
      if (message.role === "user") {
        return {
          role: "user" as const,
          content: userRoleName ? `${userRoleName}：${message.content}` : message.content,
        };
      }
      const speaker = message.personaId
        ? cast.find((persona) => persona.id === message.personaId)
        : undefined;
      return {
        role: "assistant" as const,
        content: speaker ? `${speaker.name}：${message.content}` : message.content,
      };
    });
  const recent = lines.slice(-24);
  let total = 0;
  const trimmed: AiChatMessage[] = [];
  for (const line of recent.reverse()) {
    if (total + line.content.length > 24_000) break;
    trimmed.push(line);
    total += line.content.length;
  }
  return trimmed.reverse();
}

export function buildGroupSpeakerPrompt(
  speaker: Persona,
  cast: Persona[],
  director?: Persona,
  world?: ConversationDetail["world"],
  userRole?: ConversationDetail["userRole"],
): string {
  const optional = (title: string, value: string | undefined) => (value?.trim() ? `${title}\n${value}` : "");
  const lines = [
    `你是「${speaker.name}」，正在与用户和其他成员进行群聊。`,
    `【角色卡】\n${speaker.description}`,
    optional("【世界观】", speaker.world),
    optional("【当前场景】", speaker.scenario),
    optional("【故事线】", speaker.plot),
    optional("【说话风格】", speaker.style),
    optional("【示例对话】", speaker.examples),
    "",
    "在场的其他成员：",
    cast
      .filter((persona) => persona.id !== speaker.id)
      .map((persona) => `- ${persona.name}：${persona.description.slice(0, 100)}`)
      .join("\n") || "（暂无其他成员）",
  ];
  if (director) {
    lines.push("", `主持人背景（只营造场景氛围，不替角色发言）：${director.description.slice(0, 200)}`);
  }
  if (world) {
    lines.push("", buildWorldPrompt(world));
  }
  if (userRole) {
    lines.push("", `用户扮演的角色是「${userRole.name}」${userRole.description ? `，人设：${userRole.description.slice(0, 300)}` : ""}。请直接与这位角色互动，用这个称呼称呼对方。`);
  }
  lines.push(
    "",
    "规则：直接输出你作为该角色要说的话，不要带「角色名：」前缀，不要替其他角色发言，不要跳回调度视角；用中文回复，保持角色一致。",
    "历史消息中的「角色名：」只是说话人标注，不要模仿这种格式；不要自呼其名，也不要向自己提问。",
    "你只负责自己的话：不要把其他角色的台词写成「角色名：内容」，也不要转述或预演他们的话。想表达其他人的反应时，用你自己的口吻评价或猜测（例如“猪国那家伙肯定又要吹牛了”），其他角色会由系统安排自行回应。",
  );
  return lines.join("\n\n").slice(0, 8000);
}

export function buildWorldPrompt(world: ConversationDetail["world"]): string {
  if (!world) return "";
  const { title, description, timeline, outline } = world.snapshot;
  return [
    `【世界：${title}】`,
    description ? `世界观：${description}` : "",
    timeline ? `时间线：${timeline}` : "",
    outline ? `故事大纲：${outline.slice(0, 6000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildKnowledgePrompt(hits: KnowledgeHit[]): string {
  const lines = ["以下是角色资料库中检索到的片段。回答时优先使用这些资料，资料不足就明确说明："];
  let used = 0;
  for (const hit of hits) {
    const block = `【资料 ${lines.length}】来自《${hit.documentName}》\n${hit.text}`;
    if (used + block.length > 6000) break;
    lines.push(block);
    used += block.length;
  }
  return lines.join("\n\n");
}

export function dedupeHits(hits: KnowledgeHit[]): KnowledgeHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.text)) return false;
    seen.add(hit.text);
    return true;
  });
}
