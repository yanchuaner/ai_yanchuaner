import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { getConversationDetail, type ConversationDetail } from "@/lib/conversations";
import { generateConversationMemory } from "@/lib/memory-generator";
import {
  clearPersonaMemory,
  getPersonaMemory,
  savePersonaMemory,
} from "@/lib/memory-library";
import { requireAiSession, type SessionGuardResult } from "@/lib/session-guard";
import type { AiSession } from "@/lib/session";
import type { Persona } from "@/lib/personas";

export const runtime = "nodejs";

const MIN_MESSAGES = 15;
const UPDATE_STEP = 15;

type Resolved =
  | { response: NextResponse }
  | { session: AiSession; detail: ConversationDetail; persona: Persona };

async function resolveRoleplayConversation(
  request: NextRequest,
  id: string,
): Promise<Resolved> {
  const guard: SessionGuardResult = requireAiSession(request);
  if (guard.response) return { response: guard.response };
  try {
    const detail = await getConversationDetail(guard.session.subject.userId, id);
    const persona = detail.persona;
    if (!persona) {
      return { response: NextResponse.json({ error: "普通会话暂不支持长期记忆。" }, { status: 400 }) };
    }
    return { session: guard.session, detail, persona };
  } catch {
    return { response: NextResponse.json({ error: "会话不存在。" }, { status: 404 }) };
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveRoleplayConversation(request, id);
  if ("response" in resolved) {
    if (resolved.response.status === 401) return resolved.response;
    return NextResponse.json({ memory: null });
  }
  const memory = await getPersonaMemory(resolved.session.subject.userId, resolved.persona.id);
  return NextResponse.json({ memory });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveRoleplayConversation(request, id);
  if ("response" in resolved) {
    if (resolved.response.status === 401) return resolved.response;
    return NextResponse.json({ updated: false, reason: resolved.response.status === 400 ? "普通会话暂不支持长期记忆。" : "会话不存在。" });
  }
  const { session, detail } = resolved;
  const persona = resolved.persona;
  if (detail.messages.length < MIN_MESSAGES) {
    return NextResponse.json({ updated: false, reason: "消息不足" });
  }
  const existing = await getPersonaMemory(session.subject.userId, persona.id);
  if (existing && detail.messages.length - existing.messageCount < UPDATE_STEP) {
    return NextResponse.json({ updated: false, reason: "暂不需要更新" });
  }
  const model = session.credential.models[0];
  if (!model) return NextResponse.json({ error: "当前账号未开通对话模型。" }, { status: 400 });
  try {
    const config = getAiWebConfig();
    const generated = await generateConversationMemory(
      config.yanCoreApiBaseUrl,
      session.credential.accessKey,
      model,
      detail.messages,
    );
    const memory = await savePersonaMemory(session.subject.userId, {
      personaId: persona.id,
      summary: generated.summary,
      sourceConversationId: id,
      messageCount: detail.messages.length,
    });
    return NextResponse.json({ updated: true, memory });
  } catch {
    return NextResponse.json({ error: "记忆生成失败，请稍后重试。" }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveRoleplayConversation(request, id);
  if ("response" in resolved) {
    if (resolved.response.status === 401) return resolved.response;
    return NextResponse.json({ success: true });
  }
  await clearPersonaMemory(resolved.session.subject.userId, resolved.persona.id);
  return NextResponse.json({ success: true });
}
