import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { requireAiSession } from "@/lib/session-guard";
import { getVoiceSettings, updateVoiceSettings, type VoiceSettingsInput } from "@/lib/voice-settings";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const settings = await getVoiceSettings(guard.session.subject.userId);
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || (body.asr === undefined && body.tts === undefined)) {
    return NextResponse.json({ error: "更新内容无效。" }, { status: 400 });
  }
  try {
    const config = getAiWebConfig();
    const input: VoiceSettingsInput = {
      asr: body.asr === undefined ? undefined : (body.asr as VoiceSettingsInput["asr"]),
      tts: body.tts === undefined ? undefined : (body.tts as VoiceSettingsInput["tts"]),
    };
    const settings = await updateVoiceSettings(
      guard.session.subject.userId,
      config.sessionSecret,
      input,
      config.allowInsecureInternalHttp,
    );
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: message || "保存语音设置失败。" }, { status: 400 });
  }
}
