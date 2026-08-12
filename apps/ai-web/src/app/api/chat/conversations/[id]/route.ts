import { NextRequest, NextResponse } from "next/server";
import { deleteConversation, getConversation, getConversationDetail } from "@/lib/conversations";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  try {
    const messages = await getConversation(guard.session.subject.userId, id);
    return NextResponse.json({ messages });
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
