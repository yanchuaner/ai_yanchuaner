import { NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { beginOidcLogin } from "@/lib/oidc";
import { cookieOptions, LOGIN_COOKIE, seal } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  try {
    const config = getAiWebConfig();
    const { redirectTo, transaction } = await beginOidcLogin();
    const response = NextResponse.redirect(redirectTo);
    response.cookies.set(LOGIN_COOKIE, seal(transaction, config.sessionSecret), cookieOptions(config.publicUrl, 5 * 60));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.redirect(new URL("/?auth_error=unavailable", getAiWebConfig().publicUrl));
  }
}
