import { NextRequest, NextResponse } from "next/server";
import { deleteConversation, getConversationDetail } from "@/lib/conversations";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  try {
    const conversation = await getConversationDetail(guard.session.subject.userId, id);
    return NextResponse.json(conversation);
  } catch {
    return NextResponse.json({ error: "会话不存在。" }, { status: 404 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const guard = requireAiSession(request);
	if (guard.response) return guard.response;
	const { id } = await params;
	try {
		await deleteConversation(guard.session.subject.userId, id);
		return NextResponse.json({ success: true });
	} catch {
		return NextResponse.json({ error: "会话不存在。" }, { status: 404 });
	}
}
