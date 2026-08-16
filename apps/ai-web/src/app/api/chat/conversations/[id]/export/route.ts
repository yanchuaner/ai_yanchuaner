import { NextRequest, NextResponse } from "next/server";
import { createFileConversationRepository } from "@/lib/conversation-file-repository";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
	const guard = requireAiSession(request);
	if (guard.response) return guard.response;
	const { id } = await params;
	try {
		const conversation = await createFileConversationRepository().getDetail(guard.session.subject.userId, id);
		return new NextResponse(JSON.stringify(conversation, null, 2), {
			headers: {
				"Content-Type": "application/json; charset=utf-8",
				"Content-Disposition": `attachment; filename="yanchuaner-ai-conversation-${conversation.id}.json"`,
			},
		});
	} catch {
		return NextResponse.json({ error: "会话不存在。" }, { status: 404 });
	}
}
