import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import {
  clearMediaSettings,
  getMediaSettings,
  updateMediaSettings,
  type MediaSettingsInput,
} from "@/lib/media-settings";
import { requireAiSession } from "@/lib/session-guard";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const settings = await getMediaSettings(guard.session.subject.userId);
  return NextResponse.json({ settings });
}

export async function PUT(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  const body = (await request.json().catch(() => null)) as MediaSettingsInput | null;
  try {
    const config = getAiWebConfig();
    const settings = await updateMediaSettings(
      guard.session.subject.userId,
      config.sessionSecret,
      body ?? {},
      config.allowInsecureInternalHttp,
    );
    return NextResponse.json({ settings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json({ error: message || "保存媒体设置失败。" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const guard = requireAiSession(request);
  if (guard.response) return guard.response;
  await clearMediaSettings(guard.session.subject.userId);
  return NextResponse.json({ success: true });
}
