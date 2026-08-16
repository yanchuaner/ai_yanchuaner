import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { createSessionEmbedder, resolveEmbeddingModel } from "@/lib/knowledge-embedding";
import { createFileKnowledgeRepository } from "@/lib/knowledge-file-repository";
import { parseKnowledgeRequest } from "@/lib/knowledge-request";
import { createFilePersonaRepository } from "@/lib/persona-file-repository";
import { PRESET_PERSONAS } from "@/lib/personas";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

async function resolvePersonaName(userId: number, personaId: string): Promise<string> {
  const library = await createFilePersonaRepository().list(userId);
  const persona = library.find((item) => item.id === personaId) ?? PRESET_PERSONAS.find((item) => item.id === personaId);
  return persona?.name ?? "角色";
}

function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message === "document is empty") return "资料内容不能为空。";
  if (message === "document is too large") return "资料内容过大，单份不超过 20 万字符。";
  if (message === "document limit reached") return "这个角色的资料数量已达上限。";
  if (message === "chunk limit reached") return "资料片段数量已达上限。";
  if (message === "embedding failed") return "向量化失败，请稍后重试。";
  if (message === "embedding model unavailable") return "当前账号未开通嵌入模型，请联系管理员配置。";
  return "保存资料失败。";
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  const summary = await createFileKnowledgeRepository().getSummary(guard.session.subject.userId, id);
  return NextResponse.json({ ...summary });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  const userId = guard.session.subject.userId;
  const parsed = await parseKnowledgeRequest(request);
  if (!parsed.data) return NextResponse.json({ error: parsed.error ?? "资料内容无效。" }, { status: 400 });
  const { name, text, source } = parsed.data;

  try {
    const personaName = await resolvePersonaName(userId, id);
    const model = resolveEmbeddingModel(guard.session);
    if (!model) throw new Error("embedding model unavailable");
    const embedder = createSessionEmbedder(guard.session, model, getAiWebConfig().yanCoreApiBaseUrl);
    const document = await createFileKnowledgeRepository().addText(
      userId,
      id,
      { name, text, source },
      model,
      embedder,
    );
    return NextResponse.json({ document, model });
  } catch (error) {
    return NextResponse.json({ error: errorText(error) }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  await createFileKnowledgeRepository().deleteScope(guard.session.subject.userId, id);
  return NextResponse.json({ success: true });
}
