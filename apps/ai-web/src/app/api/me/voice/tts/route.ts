import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { requireAiSession } from "@/lib/session-guard";
import { forwardTextToSpeech } from "@/lib/voice";
import { getDecryptedVoiceProvider } from "@/lib/voice-settings";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const config = getAiWebConfig();
  const provider = await getDecryptedVoiceProvider(
    guard.session.subject.userId,
    "tts",
    config.sessionSecret,
  );
  if (!provider) {
    return NextResponse.json({ error: "请先在“语音设置”中配置语音朗读。" }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 4000) {
    return NextResponse.json({ error: "朗读文本无效。" }, { status: 400 });
  }
  try {
    const result = await forwardTextToSpeech(provider, text);
    return new Response(result.audio, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": result.contentType,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "语音合成失败。" },
      { status: 502 },
    );
  }
}
