import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { createSessionEmbedder, resolveEmbeddingModel } from "@/lib/knowledge-embedding";
import { addKnowledgeDocument, deletePersonaKnowledge, getPersonaKnowledgeSummary } from "@/lib/knowledge-library";
import { listPersonas } from "@/lib/persona-library";
import { PRESET_PERSONAS } from "@/lib/personas";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

const MAX_DOCUMENT_BYTES = 1024 * 1024;

async function resolvePersonaName(userId: number, personaId: string): Promise<string> {
  const library = await listPersonas(userId);
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
  const summary = await getPersonaKnowledgeSummary(guard.session.subject.userId, id);
  return NextResponse.json({ ...summary });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  const userId = guard.session.subject.userId;
  const contentType = request.headers.get("content-type") ?? "";

  let name = "";
  let text = "";
  let source: "paste" | "file" = "paste";
  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "请选择要上传的文件。" }, { status: 400 });
    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      return NextResponse.json({ error: "仅支持 txt 或 Markdown 文件。" }, { status: 400 });
    }
    if (file.size > MAX_DOCUMENT_BYTES) {
      return NextResponse.json({ error: "文件过大，最大支持 1 MB。" }, { status: 400 });
    }
    name = file.name;
    text = await file.text();
    source = "file";
  } else {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body.text !== "string") {
      return NextResponse.json({ error: "请填写资料内容。" }, { status: 400 });
    }
    name = typeof body.name === "string" && body.name.trim() ? body.name : "粘贴资料";
    text = body.text;
  }

  try {
    const personaName = await resolvePersonaName(userId, id);
    const model = resolveEmbeddingModel(guard.session);
    if (!model) throw new Error("embedding model unavailable");
    const embedder = createSessionEmbedder(guard.session, model, getAiWebConfig().yanCoreApiBaseUrl);
    const added = await addKnowledgeDocument(
      userId,
      id,
      personaName,
      { name, text, source },
      model,
      embedder,
    );
    return NextResponse.json({ document: added.document, model: added.model });
  } catch (error) {
    return NextResponse.json({ error: errorText(error) }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  await deletePersonaKnowledge(guard.session.subject.userId, id);
  return NextResponse.json({ success: true });
}
