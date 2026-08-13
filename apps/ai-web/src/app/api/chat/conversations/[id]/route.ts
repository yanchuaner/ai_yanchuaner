import { NextRequest, NextResponse } from "next/server";
import { deleteConversation, getConversationDetail, updateConversation } from "@/lib/conversations";
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

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const guard = requireAiSession(request);
	if (guard.response) return guard.response;
	const { id } = await params;
	const body = (await request.json().catch(() => null)) as unknown;
	if (!body || typeof body !== "object" || Array.isArray(body)) {
		return NextResponse.json({ error: "更新内容无效。" }, { status: 400 });
	}
	const candidate = body as Record<string, unknown>;
	const patch: { title?: string; pinned?: boolean; archived?: boolean } = {};
	if (candidate.title !== undefined) {
		if (typeof candidate.title !== "string" || candidate.title.trim().length === 0 || candidate.title.length > 60) {
			return NextResponse.json({ error: "会话标题无效。" }, { status: 400 });
		}
		patch.title = candidate.title;
	}
	if (candidate.pinned !== undefined) {
		if (typeof candidate.pinned !== "boolean") return NextResponse.json({ error: "置顶状态无效。" }, { status: 400 });
		patch.pinned = candidate.pinned;
	}
	if (candidate.archived !== undefined) {
		if (typeof candidate.archived !== "boolean") return NextResponse.json({ error: "归档状态无效。" }, { status: 400 });
		patch.archived = candidate.archived;
	}
	try {
		const conversation = await updateConversation(guard.session.subject.userId, id, patch);
		return NextResponse.json({ conversation });
	} catch {
		return NextResponse.json({ error: "会话不存在。" }, { status: 404 });
	}
}
