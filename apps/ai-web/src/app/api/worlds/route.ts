import { NextRequest, NextResponse } from "next/server";
import { requireAiSession } from "@/lib/session-guard";
import { createWorld, listWorlds, type WorldInput } from "@/lib/worlds";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const worlds = await listWorlds(guard.session.subject.userId);
  return NextResponse.json({ worlds });
}

export async function POST(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as WorldInput | null;
  try {
    const world = await createWorld(guard.session.subject.userId, body ?? ({} as WorldInput));
    return NextResponse.json({ world }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      { error: message === "world is invalid" ? "世界观内容无效。" : "创建世界观失败。" },
      { status: 400 },
    );
  }
}
