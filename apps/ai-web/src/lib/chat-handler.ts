import { NextRequest, NextResponse } from "next/server";
import { forwardChatCompletion, parseAiChatRequest } from "@/lib/chat";
import { requestEmbeddings } from "@/lib/embedding";
import { resolveEmbeddingModel } from "@/lib/knowledge-embedding";
import { getConversationDetail } from "@/lib/conversations";
import { searchPersonaKnowledge, type KnowledgeHit } from "@/lib/knowledge-library";
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
      if (persona && query) {
        const embeddingModel = resolveEmbeddingModel(session);
        if (!embeddingModel) throw new Error("embedding model unavailable");
        const embedded = await requestEmbeddings(
          config.yanCoreApiBaseUrl,
          session.credential.accessKey,
          embeddingModel,
          [query],
          fetcher,
        );
        const threshold = Number(process.env.AI_WEB_KNOWLEDGE_THRESHOLD || 0.3);
        const hits = await searchPersonaKnowledge(
          session.subject.userId,
          persona.id,
          embedded.vectors[0],
          4,
          Number.isFinite(threshold) ? threshold : 0.3,
        );
        if (hits.length > 0) {
          parsed.messages.unshift({ role: "system", content: buildKnowledgePrompt(hits) });
          knowledgeHits = hits.length;
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
