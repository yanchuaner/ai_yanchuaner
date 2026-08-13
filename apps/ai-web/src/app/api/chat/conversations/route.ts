import { NextRequest, NextResponse } from "next/server";
import { createConversation, listConversations, type ChatMode } from "@/lib/conversations";
import { isValidPersona, type Persona } from "@/lib/personas";
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
  const body = (await request.json().catch(() => null)) as unknown;
  let mode: ChatMode = "chat";
  let persona: Persona | undefined;
  let cast: Persona[] | undefined;
  let director: Persona | undefined;
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const candidate = body as Record<string, unknown>;
    if (candidate.mode !== undefined) {
      if (candidate.mode !== "chat" && candidate.mode !== "roleplay" && candidate.mode !== "group") {
        return NextResponse.json({ error: "会话模式无效。" }, { status: 400 });
      }
      mode = candidate.mode;
    }
    if (candidate.persona !== undefined) {
      if (!isValidPersona(candidate.persona)) {
        return NextResponse.json({ error: "角色设定无效。" }, { status: 400 });
      }
      persona = candidate.persona;
      if (candidate.mode === undefined) mode = "roleplay";
    }
    if (candidate.cast !== undefined) {
      if (!Array.isArray(candidate.cast) || !candidate.cast.every(isValidPersona)) {
        return NextResponse.json({ error: "群聊成员无效。" }, { status: 400 });
      }
      cast = candidate.cast;
      if (candidate.mode === undefined) mode = "group";
    }
    if (candidate.director !== undefined) {
      if (!isValidPersona(candidate.director)) {
        return NextResponse.json({ error: "导演设定无效。" }, { status: 400 });
      }
      director = candidate.director;
    }
  }
  try {
    const conversation = await createConversation(guard.session.subject.userId, {
      mode,
      persona,
      cast,
      director,
    });
    return NextResponse.json({ conversation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error:
          message === "persona is invalid"
            ? "角色设定无效。"
            : message === "cast is invalid"
              ? "群聊成员无效，请选择 2 到 4 个不同角色。"
              : message === "director is invalid"
                ? "导演设定无效。"
                : "创建会话失败。",
      },
      { status: 400 },
    );
  }
}
