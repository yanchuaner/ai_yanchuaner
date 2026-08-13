// 服务端对称加密：用于用户自配的媒体 Key 落库保护。

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function encryptionKey(secret: string): Buffer {
  if (secret.length < 32) throw new Error("secret must contain at least 32 characters");
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptSecret(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    "v1",
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

export function decryptSecret(payload: string, secret: string): string | null {
  const parts = payload.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(parts[1], "base64url"));
    decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[2], "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
