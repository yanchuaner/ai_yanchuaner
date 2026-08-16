import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { requireAiSession } from "@/lib/session-guard";
import { forwardSpeechToText } from "@/lib/voice";
import { createFileByokSettingsRepository } from "@/lib/byok-settings-file-repository";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const config = getAiWebConfig();
  const provider = await createFileByokSettingsRepository(
    config.sessionSecret,
    config.allowInsecureInternalHttp,
  ).getDecryptedVoice(
    guard.session.subject.userId,
    "asr",
  );
  if (!provider) {
    return NextResponse.json({ error: "请先在“语音设置”中配置语音输入。" }, { status: 400 });
  }
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少音频文件。" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "音频文件过大，最大支持 25 MB。" }, { status: 400 });
  }
  try {
    const bytes = await file.arrayBuffer();
    const text = await forwardSpeechToText(
      provider,
      { bytes, name: file.name || "voice.webm", type: file.type || "audio/webm" },
    );
    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "语音转写失败。" },
      { status: 502 },
    );
  }
}
