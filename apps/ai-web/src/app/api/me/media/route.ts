import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import type { MediaSettingsInput } from "@/lib/media-settings";
import { createFileByokSettingsRepository } from "@/lib/byok-settings-file-repository";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const config = getAiWebConfig();
  const settings = await createFileByokSettingsRepository(
    config.sessionSecret,
    config.allowInsecureInternalHttp,
  ).getMedia(guard.session.subject.userId);
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as MediaSettingsInput | null;
  try {
    const config = getAiWebConfig();
    const settings = await createFileByokSettingsRepository(
      config.sessionSecret,
      config.allowInsecureInternalHttp,
    ).updateMedia(guard.session.subject.userId, body ?? {});
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: message || "保存媒体设置失败。" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  await createFileByokSettingsRepository(
    getAiWebConfig().sessionSecret,
    getAiWebConfig().allowInsecureInternalHttp,
  ).clearMedia(guard.session.subject.userId);
  return NextResponse.json({ success: true });
}
