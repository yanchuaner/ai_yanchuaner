import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { completeOidcLogin } from "@/lib/oidc";
import {
  cookieOptions,
  isValidLoginTransaction,
  LOGIN_COOKIE,
  seal,
  SESSION_COOKIE,
  type AiSession,
  type LoginTransaction,
  unseal,
} from "@/lib/session";
import { exchangeMainSiteToken } from "@/lib/yancore";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const config = getAiWebConfig();
  const transaction = unseal<LoginTransaction>(request.cookies.get(LOGIN_COOKIE)?.value, config.sessionSecret);
  const failure = new URL("/?auth_error=invalid", config.publicUrl);
  if (!isValidLoginTransaction(transaction)) return NextResponse.redirect(failure);

  try {
    const callbackUrl = new URL(config.oidcRedirectUri);
    callbackUrl.search = request.nextUrl.search;
    const login = await completeOidcLogin(callbackUrl, transaction);
    const exchange = await exchangeMainSiteToken(login.accessToken);
    const session: AiSession = {
      identity: login.identity,
      subject: {
        userId: exchange.userId,
        application: exchange.application,
        audience: exchange.audience,
        scopes: exchange.scopes,
      },
      grant: exchange.grant,
      grantExpiresAt: exchange.expiresAt,
    };
    const maxAge = Math.max(1, exchange.expiresAt - Math.floor(Date.now() / 1000));
    const response = NextResponse.redirect(config.publicUrl);
    response.cookies.set(SESSION_COOKIE, seal(session, config.sessionSecret), cookieOptions(config.publicUrl, maxAge));
    response.cookies.set(LOGIN_COOKIE, "", cookieOptions(config.publicUrl, 0));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    const response = NextResponse.redirect(failure);
    response.cookies.set(LOGIN_COOKIE, "", cookieOptions(config.publicUrl, 0));
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
