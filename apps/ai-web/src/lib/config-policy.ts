export function isAllowedPublicUrl(url: URL, production: boolean, allowInsecureInternalHttp: boolean): boolean {
  if (url.protocol === "https:" || !production) return true;
  if (!allowInsecureInternalHttp || url.protocol !== "http:") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
}
