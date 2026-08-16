import { NextRequest, NextResponse } from "next/server";
import { requireAiSession } from "@/lib/session-guard";
import { type WorldInput } from "@/lib/worlds";
import { createFileWorldRepository } from "@/lib/world-file-repository";

export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  const world = await createFileWorldRepository().get(guard.session.subject.userId, id);
  if (!world) return NextResponse.json({ error: "世界观不存在。" }, { status: 404 });
  return NextResponse.json({ world });
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  const body = (await request.json().catch(() => null)) as WorldInput | null;
  try {
    const world = await createFileWorldRepository().update(guard.session.subject.userId, id, body ?? ({} as WorldInput));
    return NextResponse.json({ world });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          message === "world is invalid"
            ? "世界观内容无效。"
            : message === "world not found"
              ? "世界观不存在。"
              : "更新世界观失败。",
      },
      { status: message === "world not found" ? 404 : 400 },
    );
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const { id } = await params;
  try {
    await createFileWorldRepository().delete(guard.session.subject.userId, id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "世界观不存在。" }, { status: 404 });
  }
}
