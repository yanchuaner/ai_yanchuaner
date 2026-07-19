import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const LOGIN_COOKIE = "yc_ai_login";
export const SESSION_COOKIE = "yc_ai_session";

export type LoginTransaction = {
  state: string;
  nonce: string;
  codeVerifier: string;
  expiresAt: number;
};

export type AiSession = {
  identity: {
    sub: string;
    name: string;
    role: "admin" | "alumni" | "student" | "teacher";
  };
  subject: {
    userId: number;
    application: "ai-web";
    audience: "yanchuaner-ai";
    scopes: string;
  };
  grant: string;
  grantExpiresAt: number;
};

type CookieOptions = {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  path: "/";
  maxAge: number;
};

function encryptionKey(secret: string): Buffer {
  if (secret.length < 32) throw new Error("session secret must contain at least 32 characters");
  return createHash("sha256").update(secret, "utf8").digest();
}

export function seal(value: unknown, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return ["v1", iv.toString("base64url"), encrypted.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
}

export function unseal<T>(value: string | undefined, secret: string): T | null {
  if (!value || value.length > 4096) return null;
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const iv = Buffer.from(parts[1], "base64url");
    const encrypted = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function cookieOptions(publicUrl: URL, maxAge: number): CookieOptions {
  return {
    httpOnly: true,
    secure: publicUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge,
  };
}

export function isValidLoginTransaction(value: LoginTransaction | null, now = Date.now()): value is LoginTransaction {
  return Boolean(
    value &&
      value.state &&
      value.nonce &&
      value.codeVerifier &&
      Number.isFinite(value.expiresAt) &&
      value.expiresAt > now,
  );
}

export function isValidAiSession(value: AiSession | null, now = Math.floor(Date.now() / 1000)): value is AiSession {
  return Boolean(
    value &&
      value.identity?.sub &&
      value.subject?.userId > 0 &&
      value.subject.application === "ai-web" &&
      value.subject.audience === "yanchuaner-ai" &&
      value.grant &&
      Number.isFinite(value.grantExpiresAt) &&
      value.grantExpiresAt > now,
  );
}
