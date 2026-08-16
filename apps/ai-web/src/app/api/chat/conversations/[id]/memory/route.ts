import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { type ConversationDetail } from "@/lib/conversations";
import { createFileConversationRepository } from "@/lib/conversation-file-repository";
import {
  clearConversationMemories,
  listConversationMemories,
  updateConversationMemories,
} from "@/lib/memory-handler";
import { requireAiSession, type SessionGuardResult } from "@/lib/session-guard";
import type { AiSession } from "@/lib/session";

export const runtime = "nodejs";

type Resolved =
  | { response: NextResponse }
  | { session: AiSession; detail: ConversationDetail };

async function resolveMemoryConversation(
  request: NextRequest,
  id: string,
): Promise<Resolved> {
  const guard: SessionGuardResult = requireAiSession(request);
  if (guard.response) return { response: guard.response };
  try {
    const detail = await createFileConversationRepository().getDetail(guard.session.subject.userId, id);
    if (detail.mode === "roleplay" || detail.mode === "group") {
      return { session: guard.session, detail };
    }
    return { response: NextResponse.json({ error: "该会话暂不支持长期记忆。" }, { status: 400 }) };
  } catch {
    return { response: NextResponse.json({ error: "会话不存在。" }, { status: 404 }) };
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveMemoryConversation(request, id);
  if ("response" in resolved) {
    if (resolved.response.status === 401) return resolved.response;
    return NextResponse.json({ memory: null });
  }
  const memories = await listConversationMemories(resolved.session.subject.userId, resolved.detail);
  if (resolved.detail.mode === "group") {
    return NextResponse.json({ memories });
  }
  return NextResponse.json({ memory: memories[0]?.memory ?? null });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveMemoryConversation(request, id);
  if ("response" in resolved) {
    if (resolved.response.status === 401) return resolved.response;
    return NextResponse.json({ updated: false, reason: resolved.response.status === 400 ? "该会话暂不支持长期记忆。" : "会话不存在。" });
  }
  const { session, detail } = resolved;
  const model = session.credential.models[0];
  if (!model) return NextResponse.json({ error: "当前账号未开通对话模型。" }, { status: 400 });
  try {
    const config = getAiWebConfig();
    const result = await updateConversationMemories(
      config.yanCoreApiBaseUrl,
      session.credential.accessKey,
      model,
      session.subject.userId,
      detail,
    );
    if (detail.mode === "group") {
      return NextResponse.json({ updated: result.updated, memories: result.memories });
    }
    return NextResponse.json({
      updated: result.updated,
      memory: result.memories[0]?.memory ?? null,
    });
  } catch {
    return NextResponse.json({ error: "记忆生成失败，请稍后重试。" }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveMemoryConversation(request, id);
  if ("response" in resolved) {
    if (resolved.response.status === 401) return resolved.response;
    return NextResponse.json({ success: true });
  }
  await clearConversationMemories(resolved.session.subject.userId, resolved.detail);
  return NextResponse.json({ success: true });
}
