import { NextRequest, NextResponse } from "next/server";
import { getConversation } from "@/lib/conversations";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  try {
    const messages = await getConversation(guard.session.subject.userId, params.id);
    return NextResponse.json({ messages });
  } catch {
    return NextResponse.json({ error: "会话不存在。" }, { status: 404 });
  }
}
