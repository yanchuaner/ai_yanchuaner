import { NextRequest, NextResponse } from "next/server";
import { createFileKnowledgeRepository } from "@/lib/knowledge-file-repository";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { docId } = await params;
  try {
    await createFileKnowledgeRepository().deleteDocument(guard.session.subject.userId, docId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "资料不存在。" }, { status: 404 });
  }
}
