import { NextRequest, NextResponse } from "next/server";
import { deleteKnowledgeDocument } from "@/lib/knowledge-library";
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
    await deleteKnowledgeDocument(guard.session.subject.userId, docId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "资料不存在。" }, { status: 404 });
  }
}
