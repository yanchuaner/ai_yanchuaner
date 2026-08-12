import { NextRequest, NextResponse } from "next/server";
import { createConversation, listConversations } from "@/lib/conversations";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const conversations = await listConversations(guard.session.subject.userId);
  return NextResponse.json({ conversations });
}

export async function POST(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const conversation = await createConversation(guard.session.subject.userId);
  return NextResponse.json({ conversation });
}
