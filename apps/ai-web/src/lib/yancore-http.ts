import "server-only";

import { NextResponse } from "next/server";
import { getAiWebConfig } from "@/lib/config";
import { cookieOptions, SESSION_COOKIE } from "@/lib/session";
import { mapYanCoreError } from "@/lib/yancore-http-mapping";

export function yanCoreErrorResponse(error: unknown): NextResponse {
  const mapped = mapYanCoreError(error);
  const response = NextResponse.json(mapped.body, { status: mapped.status });
  if (mapped.clearSession) {
    const config = getAiWebConfig();
    response.cookies.set(SESSION_COOKIE, "", cookieOptions(config.publicUrl, 0));
  }
  return response;
}
