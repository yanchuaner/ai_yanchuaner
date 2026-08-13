import { NextRequest, NextResponse } from "next/server";
import { appendMessage, type StoredMessage } from "@/lib/conversations";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as unknown;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "消息格式无效。" }, { status: 400 });
  }
  const candidate = body as Record<string, unknown>;
  const message: StoredMessage = {
    id: typeof candidate.id === "string" ? candidate.id : crypto.randomUUID(),
    role: candidate.role as StoredMessage["role"],
    content: typeof candidate.content === "string" ? candidate.content : "",
    personaId: typeof candidate.personaId === "string" ? candidate.personaId : undefined,
    requestId: typeof candidate.requestId === "string" ? candidate.requestId : undefined,
    usage:
      candidate.usage && typeof candidate.usage === "object"
        ? {
            prompt: (candidate.usage as Record<string, unknown>).prompt as number,
            completion: (candidate.usage as Record<string, unknown>).completion as number,
          }
        : undefined,
  };
  try {
    const conversation = await appendMessage(guard.session.subject.userId, id, message);
    return NextResponse.json({ conversation });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: messageText === "conversation not found" ? "会话不存在。" : "消息保存失败。" }, {
      status: messageText === "conversation not found" ? 404 : 400,
    });
  }
}
