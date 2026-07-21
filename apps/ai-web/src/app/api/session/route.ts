import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { cookieOptions, isValidAiSession, publicAiSession, SESSION_COOKIE, type AiSession, unseal } from "@/lib/session";

export const runtime = "nodejs";

export function GET(request: NextRequest) {
  const config = getAiWebConfig();
  const session = unseal<AiSession>(request.cookies.get(SESSION_COOKIE)?.value, config.sessionSecret);
  if (!isValidAiSession(session)) {
    const response = NextResponse.json({ authenticated: false }, { status: 401 });
    response.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  return NextResponse.json(publicAiSession(session), { headers: { "Cache-Control": "no-store" } });
}
