import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { forwardImageGeneration } from "@/lib/media";
import { createFileByokSettingsRepository } from "@/lib/byok-settings-file-repository";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const config = getAiWebConfig();
  const provider = await createFileByokSettingsRepository(
    config.sessionSecret,
    config.allowInsecureInternalHttp,
  ).getDecryptedMedia(
    guard.session.subject.userId,
  );
  if (!provider) {
    return NextResponse.json({ error: "请先在“媒体设置”中配置画图服务。" }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 2000) {
    return NextResponse.json({ error: "画图提示词无效。" }, { status: 400 });
  }
  try {
    const image = await forwardImageGeneration(
      provider.baseUrl,
      provider.apiKey,
      provider.imageModel,
      prompt,
    );
    return NextResponse.json({ image });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "图片生成失败。" },
      { status: 502 },
    );
  }
}
