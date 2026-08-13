import { NextRequest, NextResponse } from "next/server";
import { listDocumentChunks } from "@/lib/knowledge-library";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const documentId = request.nextUrl.searchParams.get("documentId");
  if (!documentId) return NextResponse.json({ error: "缺少资料 ID。" }, { status: 400 });
  const chunks = await listDocumentChunks(guard.session.subject.userId, documentId);
  return NextResponse.json({ chunks });
}
