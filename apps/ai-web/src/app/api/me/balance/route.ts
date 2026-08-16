import { NextRequest, NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { cookieOptions, isValidAiSession, SESSION_COOKIE, type AiSession, unseal } from "@/lib/session";
import { createYanCoreGateway } from "@/lib/yancore-gateway";
import { yanCoreErrorResponse } from "@/lib/yancore-http";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const config = getAiWebConfig();
  const session = unseal<AiSession>(request.cookies.get(SESSION_COOKIE)?.value, config.sessionSecret);
  if (!isValidAiSession(session)) {
    const response = NextResponse.json({ error: "登录会话已失效。" }, { status: 401 });
    response.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
    return response;
  }
  try {
    const account = await createYanCoreGateway(config.yanCoreApiBaseUrl).balance(session.grant);
    return NextResponse.json({
      userId: account.userId || session.subject.userId,
      balanceUnits: account.balanceUnits,
    });
  } catch (error) {
    return yanCoreErrorResponse(error);
  }
}
