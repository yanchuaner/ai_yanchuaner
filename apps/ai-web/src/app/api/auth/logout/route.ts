import { NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { cookieOptions, LOGIN_COOKIE, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";

export function POST() {
  const config = getAiWebConfig();
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
  response.cookies.set(LOGIN_COOKIE, "", cookieOptions(config.publicUrl, 0));
  response.headers.set("Cache-Control", "no-store");
  return response;
}
