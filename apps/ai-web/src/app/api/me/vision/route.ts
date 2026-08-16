import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { forwardVision } from "@/lib/media";
import { createFileByokSettingsRepository } from "@/lib/byok-settings-file-repository";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

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
    return NextResponse.json({ error: "请先在“媒体设置”中配置视觉服务。" }, { status: 400 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const image = typeof body?.image === "string" ? body.image : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!image.startsWith("data:image/") || image.length > MAX_IMAGE_BYTES * 2) {
    return NextResponse.json({ error: "图片数据无效。" }, { status: 400 });
  }
  try {
    const text = await forwardVision(
      provider.baseUrl,
      provider.apiKey,
      provider.visionModel,
      image,
      prompt || "请描述这张图片的内容，尽量具体、客观，方便不看到图片的人理解。",
    );
    return NextResponse.json({ text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "视觉理解失败。" },
      { status: 502 },
    );
  }
}
