import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { cookieOptions, isValidAiSession, SESSION_COOKIE, type AiSession, unseal } from "@/lib/session";

export const runtime = "nodejs";

type IntrospectResponse = {
  success?: boolean;
  data?: {
    account?: {
      user_id?: number;
      balance_units?: number;
    };
  };
};

export async function GET(request: NextRequest) {
  const config = getAiWebConfig();
  const session = unseal<AiSession>(request.cookies.get(SESSION_COOKIE)?.value, config.sessionSecret);
  if (!isValidAiSession(session)) {
    const response = NextResponse.json({ error: "登录会话已失效。" }, { status: 401 });
    response.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
    return response;
  }
  const endpoint = new URL("/api/yancore/grants/introspect", config.yanCoreApiBaseUrl);
  try {
    const upstream = await fetch(endpoint, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.grant}`,
      },
      body: JSON.stringify({ audience: "yanchuaner-ai" }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await upstream.json().catch(() => null)) as IntrospectResponse | null;
    const account = body?.data?.account;
    if (!upstream.ok || !body?.success || typeof account?.balance_units !== "number") {
      return NextResponse.json({ error: "额度信息暂时不可用。" }, { status: 502 });
    }
    return NextResponse.json({
      userId: account.user_id ?? session.subject.userId,
      balanceUnits: account.balance_units,
    });
  } catch {
    return NextResponse.json({ error: "额度信息暂时不可用。" }, { status: 502 });
  }
}
