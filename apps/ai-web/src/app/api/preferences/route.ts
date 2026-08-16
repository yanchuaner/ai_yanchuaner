import { NextRequest, NextResponse } from "next/server";
import { createFilePreferencesRepository } from "@/lib/preferences-file-repository";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const preferences = await createFilePreferencesRepository().get(guard.session.subject.userId);
  return NextResponse.json({ preferences });
}

export async function PUT(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as unknown;
  const candidate =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  if (candidate.favoritePersonaIds === undefined) {
    return NextResponse.json({ error: "更新内容无效。" }, { status: 400 });
  }
  try {
    const preferences = await createFilePreferencesRepository().setFavorites(
      guard.session.subject.userId,
      candidate.favoritePersonaIds as string[],
    );
    return NextResponse.json({ preferences });
  } catch {
    return NextResponse.json({ error: "收藏列表无效。" }, { status: 400 });
  }
}
