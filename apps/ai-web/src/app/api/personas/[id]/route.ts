import { NextRequest, NextResponse } from "next/server";
import { deletePersona } from "@/lib/persona-library";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  try {
    await deletePersona(guard.session.subject.userId, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "角色不存在。" }, { status: 404 });
  }
}
