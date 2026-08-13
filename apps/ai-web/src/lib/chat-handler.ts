import { NextRequest, NextResponse } from "next/server";
import { forwardChatCompletion, parseAiChatRequest } from "@/lib/chat";
import { requestEmbeddings } from "@/lib/embedding";
import { resolveEmbeddingModel } from "@/lib/knowledge-embedding";
import { getConversationDetail } from "@/lib/conversations";
import {
  searchPersonaKnowledge,
  searchUserKnowledge,
  type KnowledgeHit,
} from "@/lib/knowledge-library";
import { getPersonaMemory } from "@/lib/memory-library";
import type { Persona } from "@/lib/personas";
import { cookieOptions, isValidAiSession, SESSION_COOKIE, type AiSession, unseal } from "@/lib/session";

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
  let knowledgeHits = 0;
  const candidate = body as Record<string, unknown> | null;
  if (candidate?.knowledge === true && typeof candidate.conversationId === "string") {
    try {
      const detail = await getConversationDetail(session.subject.userId, candidate.conversationId);
      const persona = detail.persona;
      const query = [...parsed.messages].reverse().find((message) => message.role === "user")?.content;
      const hasGroup = detail.mode === "group" && Boolean(detail.cast?.length);
      if ((persona || hasGroup) && query) {
        const injections: { role: "system"; content: string }[] = [];
        if (hasGroup && detail.cast) {
          injections.push({ role: "system", content: buildGroupPrompt(detail.cast, detail.director) });
        }
        const memoryPersona = hasGroup ? detail.director : persona;
        if (memoryPersona) {
          const memory = await getPersonaMemory(session.subject.userId, memoryPersona.id).catch(() => null);
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
            hasGroup ? 2 : 4,
            Number.isFinite(threshold) ? threshold : 0.3,
          );
          let hits: KnowledgeHit[];
          if (hasGroup && detail.cast) {
            const castHits = await Promise.all(
              detail.cast.map((castPersona) =>
                searchPersonaKnowledge(
                  session.subject.userId,
                  castPersona.id,
                  embedded.vectors[0],
                  2,
                  Number.isFinite(threshold) ? threshold : 0.3,
                ).then((results) =>
                  results.map((hit) => ({
                    ...hit,
                    documentName: `${castPersona.name} · ${hit.documentName}`,
                  })),
                ),
              ),
            );
            hits = dedupeHits([...castHits.flat(), ...userHits]).slice(0, 6);
          } else if (persona) {
            const personaHits = await searchPersonaKnowledge(
              session.subject.userId,
              persona.id,
              embedded.vectors[0],
              4,
              Number.isFinite(threshold) ? threshold : 0.3,
            );
            hits = dedupeHits([...personaHits, ...userHits]).slice(0, 4);
          } else {
            hits = [];
          }
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
    const upstream = await forwardChatCompletion(config.yanCoreApiBaseUrl, session.credential.accessKey, parsed, fetcher, request.signal);
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

function buildKnowledgePrompt(hits: KnowledgeHit[]): string {
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

function dedupeHits(hits: KnowledgeHit[]): KnowledgeHit[] {
  const seen = new Set<string>();
  return hits.filter((hit) => {
    if (seen.has(hit.text)) return false;
    seen.add(hit.text);
    return true;
  });
}

function buildGroupPrompt(cast: Persona[], director?: Persona): string {
  const lines = ["你正在参与一场多人角色扮演群聊，以下是全部成员设定：", ""];
  for (const persona of cast) {
    lines.push(`《${persona.name}》`);
    lines.push(persona.description);
    if (persona.style) lines.push(`说话风格：${persona.style}`);
    if (persona.world) lines.push(`世界观：${persona.world}`);
    lines.push("");
  }
  if (director) {
    lines.push("【导演】");
    lines.push(director.description);
    if (director.style) lines.push(`导演风格：${director.style}`);
    lines.push("");
  }
  lines.push(
    "规则：每次由其中一个角色发言，发言以「角色名：」开头；不要替其他角色说话；导演负责旁白、场景与节奏推进；用中文回复，保持角色一致。",
  );
  return lines.join("\n").slice(0, 8000);
}
