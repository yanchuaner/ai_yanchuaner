import { NextRequest, NextResponse } from "next/server";
import { createPersona } from "@/lib/persona-library";
import { charaCardV3ToPersonaInput } from "@/lib/chara-card";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as unknown;
  const card =
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).card
      : undefined;
  try {
    const input = charaCardV3ToPersonaInput(card);
    const persona = await createPersona(guard.session.subject.userId, input);
    return NextResponse.json({ persona }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const text =
      message === "invalid chara card"
        ? "角色卡格式无效，请使用 chara_card_v3 文件。"
        : message === "persona input is invalid"
          ? "角色卡内容超出允许范围。"
          : message === "persona limit reached"
            ? "角色数量已达上限。"
            : "导入角色失败。";
    return NextResponse.json({ error: text }, { status: 400 });
  }
}
