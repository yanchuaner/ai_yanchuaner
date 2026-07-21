import "server-only";

import { getAiWebConfig } from "@/lib/config";

type ExchangeResponse = {
  success: boolean;
  data?: {
    grant?: string;
    credential?: {
      access_key?: string;
      models?: string[];
      quota_units?: number;
      expires_at?: number;
    };
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
  accessKey: string;
  models: string[];
  quotaUnits: number;
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
  const credential = body?.data?.credential;
  if (
    !response.ok ||
    !body?.success ||
    typeof body.data?.grant !== "string" ||
    typeof subject?.user_id !== "number" ||
    subject.application !== "ai-web" ||
    subject.audience !== "yanchuaner-ai" ||
    typeof subject.scopes !== "string" ||
    typeof subject.expires_at !== "number" ||
    typeof credential?.access_key !== "string" ||
    !/^sk-yc_[0-9a-f]{64}$/.test(credential.access_key) ||
    !Array.isArray(credential.models) ||
    credential.models.length === 0 ||
    !credential.models.every((model) => typeof model === "string" && model.length > 0 && model.length <= 128) ||
    typeof credential.quota_units !== "number" ||
    !Number.isInteger(credential.quota_units) ||
    credential.quota_units <= 0 ||
    credential.expires_at !== subject.expires_at
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
    accessKey: credential.access_key,
    models: credential.models,
    quotaUnits: credential.quota_units,
  };
}
