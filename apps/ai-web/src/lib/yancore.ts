import "server-only";

import { getAiWebConfig } from "@/lib/config";

type ExchangeResponse = {
  success: boolean;
  data?: {
    grant?: string;
    subject?: {
      user_id?: number;
      application?: string;
      audience?: string;
      scopes?: string;
      expires_at?: number;
    };
  };
};

export type YanCoreExchange = {
  grant: string;
  userId: number;
  application: "ai-web";
  audience: "yanchuaner-ai";
  scopes: string;
  expiresAt: number;
};

export async function exchangeMainSiteToken(subjectToken: string): Promise<YanCoreExchange> {
  const config = getAiWebConfig();
  const endpoint = new URL("/api/yancore/subject-exchange", config.yanCoreApiBaseUrl);
  const authorization = Buffer.from(`${config.yanCoreExchangeClientId}:${config.yanCoreExchangeClientSecret}`).toString("base64");
  const response = await fetch(endpoint, {
    method: "POST",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      Authorization: `Basic ${authorization}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ subject_token: subjectToken, ttl: 15 * 60 }),
    signal: AbortSignal.timeout(8_000),
  });
  const body = (await response.json().catch(() => null)) as ExchangeResponse | null;
  const subject = body?.data?.subject;
  if (
    !response.ok ||
    !body?.success ||
    typeof body.data?.grant !== "string" ||
    typeof subject?.user_id !== "number" ||
    subject.application !== "ai-web" ||
    subject.audience !== "yanchuaner-ai" ||
    typeof subject.scopes !== "string" ||
    typeof subject.expires_at !== "number"
  ) {
    throw new Error("YanCore subject exchange failed");
  }
  return {
    grant: body.data.grant,
    userId: subject.user_id,
    application: "ai-web",
    audience: "yanchuaner-ai",
    scopes: subject.scopes,
    expiresAt: subject.expires_at,
  };
}
