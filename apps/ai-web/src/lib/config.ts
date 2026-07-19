import "server-only";

export type AiWebConfig = {
  publicUrl: URL;
  sessionSecret: string;
  oidcIssuer: URL;
  oidcDiscoveryUrl: URL;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcRedirectUri: string;
  yanCoreApiBaseUrl: URL;
  allowInsecureInternalHttp: boolean;
  yanCoreExchangeClientId: string;
  yanCoreExchangeClientSecret: string;
};

let cachedConfig: AiWebConfig | undefined;

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requiredUrl(name: string, httpsInProduction = true): URL {
  const url = new URL(required(name));
  if (!url.host || !["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${name} must be an HTTP(S) URL`);
  }
  if (httpsInProduction && process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production`);
  }
  return url;
}

export function getAiWebConfig(): AiWebConfig {
  if (cachedConfig) return cachedConfig;
  const sessionSecret = required("AI_WEB_SESSION_SECRET");
  const exchangeSecret = required("YANCORE_SUBJECT_EXCHANGE_CLIENT_SECRET");
  if (sessionSecret.length < 32 || exchangeSecret.length < 32) {
    throw new Error("AI Web session and exchange secrets must contain at least 32 characters");
  }
  const publicUrl = requiredUrl("AI_WEB_PUBLIC_URL");
  const allowInsecureInternalHttp = process.env.AI_WEB_ALLOW_INSECURE_INTERNAL_HTTP === "true";
  cachedConfig = {
    publicUrl,
    sessionSecret,
    oidcIssuer: requiredUrl("YANCORE_OIDC_ISSUER", !allowInsecureInternalHttp),
    oidcDiscoveryUrl: requiredUrl("YANCORE_OIDC_DISCOVERY_URL", !allowInsecureInternalHttp),
    oidcClientId: required("YANCORE_OIDC_CLIENT_ID"),
    oidcClientSecret: required("YANCORE_OIDC_CLIENT_SECRET"),
    oidcRedirectUri: new URL("/api/auth/callback", publicUrl).toString(),
    yanCoreApiBaseUrl: requiredUrl("YANCORE_API_BASE_URL", !allowInsecureInternalHttp),
    allowInsecureInternalHttp,
    yanCoreExchangeClientId: required("YANCORE_SUBJECT_EXCHANGE_CLIENT_ID"),
    yanCoreExchangeClientSecret: exchangeSecret,
  };
  return cachedConfig;
}

export function resetAiWebConfigForTests(): void {
  cachedConfig = undefined;
}
