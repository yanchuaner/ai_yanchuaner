import { NextRequest, NextResponse } from "next/server";
import { createPersona, listPersonas } from "@/lib/persona-library";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const personas = await listPersonas(guard.session.subject.userId);
  return NextResponse.json({ personas });
}

export async function POST(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as unknown;
  const input =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).persona
      : undefined;
  try {
    const persona = await createPersona(guard.session.subject.userId, input);
    return NextResponse.json({ persona });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const text =
      message === "persona input is invalid"
        ? "角色设定无效。"
        : message === "persona limit reached"
          ? "角色数量已达上限。"
          : "保存角色失败。";
    return NextResponse.json({ error: text }, { status: 400 });
  }
}
