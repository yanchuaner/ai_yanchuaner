import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { cookieOptions, isValidAiSession, SESSION_COOKIE, type AiSession, unseal } from "@/lib/session";

export type SessionGuardResult =
  | { session: AiSession; response: null }
  | { session: null; response: NextResponse };

export function requireAiSession(request: NextRequest): SessionGuardResult {
  const config = getAiWebConfig();
  const session = unseal<AiSession>(request.cookies.get(SESSION_COOKIE)?.value, config.sessionSecret);
  if (!isValidAiSession(session)) {
    const response = NextResponse.json({ error: "登录会话已失效。" }, { status: 401 });
    response.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
    return { session: null, response };
  }
  return { session, response: null };
}
