import "server-only";

import * as oidc from "openid-client";
import { getAiWebConfig } from "@/lib/config";
import type { LoginTransaction } from "@/lib/session";

type OidcIdentity = {
  sub: string;
  name: string;
  role: "admin" | "alumni" | "student" | "teacher";
};

let cachedOidcConfig: Promise<oidc.Configuration> | undefined;

function trustedRole(value: unknown): OidcIdentity["role"] | null {
  return value === "admin" || value === "alumni" || value === "student" || value === "teacher" ? value : null;
}

async function loadOidcConfig(): Promise<oidc.Configuration> {
  const app = getAiWebConfig();
  const response = await fetch(app.oidcDiscoveryUrl, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) throw new Error("OIDC discovery failed");
  const metadata = (await response.json()) as oidc.ServerMetadata;
  if (metadata.issuer !== app.oidcIssuer.toString().replace(/\/$/, "")) {
    throw new Error("OIDC issuer mismatch");
  }
  for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint, metadata.jwks_uri]) {
    if (typeof endpoint !== "string") throw new Error("OIDC metadata is incomplete");
    const url = new URL(endpoint);
    if (url.protocol === "http:" && !app.allowInsecureInternalHttp) {
      throw new Error("OIDC endpoints must use HTTPS in production");
    }
  }
  const configuration = new oidc.Configuration(
    metadata,
    app.oidcClientId,
    { client_secret: app.oidcClientSecret, token_endpoint_auth_method: "client_secret_post" },
    oidc.ClientSecretPost(app.oidcClientSecret),
  );
  configuration.timeout = 5;
  if (app.allowInsecureInternalHttp) oidc.allowInsecureRequests(configuration);
  return configuration;
}

function oidcConfig(): Promise<oidc.Configuration> {
  cachedOidcConfig ??= loadOidcConfig().catch((error) => {
    cachedOidcConfig = undefined;
    throw error;
  });
  return cachedOidcConfig;
}

export async function beginOidcLogin(): Promise<{ redirectTo: URL; transaction: LoginTransaction }> {
  const app = getAiWebConfig();
  const configuration = await oidcConfig();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);
  const transaction: LoginTransaction = {
    state: oidc.randomState(),
    nonce: oidc.randomNonce(),
    codeVerifier,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };
  const redirectTo = oidc.buildAuthorizationUrl(configuration, {
    client_id: app.oidcClientId,
    redirect_uri: app.oidcRedirectUri,
    response_type: "code",
    scope: "openid profile email",
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  return { redirectTo, transaction };
}

export async function completeOidcLogin(callbackUrl: URL, transaction: LoginTransaction): Promise<{ accessToken: string; identity: OidcIdentity }> {
  const configuration = await oidcConfig();
  const tokens = await oidc.authorizationCodeGrant(configuration, callbackUrl, {
    expectedState: transaction.state,
    expectedNonce: transaction.nonce,
    pkceCodeVerifier: transaction.codeVerifier,
    idTokenExpected: true,
  });
  const claims = tokens.claims();
  const role = trustedRole(claims?.role);
  if (!tokens.access_token || !claims || typeof claims.sub !== "string" || claims.email_verified !== true || !role) {
    throw new Error("OIDC identity is incomplete");
  }
  const name = typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : claims.sub;
  return { accessToken: tokens.access_token, identity: { sub: claims.sub, name, role } };
}
