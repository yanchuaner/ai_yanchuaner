export type YanCoreErrorCode = "unauthenticated" | "forbidden" | "not_found" | "quota_exhausted" | "rate_limited" | "upstream_unavailable" | "timeout" | "invalid_response" | "internal_error";
export class YanCoreError extends Error { constructor(public readonly code: YanCoreErrorCode, message: string = code, public readonly status?: number) { super(message); this.name = "YanCoreError"; } }
export type GatewayExchange = { grant: string; userId: number; application: "ai-web"; audience: "yanchuaner-ai"; scopes: string; expiresAt: number; accessKey: string; models: string[]; quotaUnits: number };
export type GatewayBalance = { userId: number; balanceUnits: number };
export type GatewayLedgerEntry = { id: number; entry_type: string; funding_source: string; amount: number; balance_after: number; reason: string; request_id: string; created_at: number };
export type GatewayKey = { id: number; name: string; key: string; status: number; model_limits_enabled: boolean; model_limits: string; remain_quota: number; unlimited_quota: boolean; expired_time: number; created_time: number };
export type GatewayKeyCreate = { key: string; token: GatewayKey };
export type GatewayCapability = { schema_version: string; id: string; version: string; modalities: { input: string[]; output: string[] }; streaming: boolean; billing: { mode: "platform" | "byok" | "none"; unit: string }; availability: string; [key: string]: unknown };
export type GatewayChatRequest = { model: string; messages: { role: "system" | "user" | "assistant"; content: string }[] };
export type GatewayEmbedding = { model: string; vectors: number[][]; usage: { prompt_tokens: number; total_tokens: number } };

function classify(status: number, body: any): YanCoreError {
  if (status === 401) return new YanCoreError("unauthenticated", "登录会话已失效。", status);
  if (status === 403) return new YanCoreError("forbidden", "无权使用该能力。", status);
  if (status === 404) return new YanCoreError("not_found", "资源不存在。", status);
  if (status === 402 || body?.error?.code === "quota_exhausted") return new YanCoreError("quota_exhausted", `公益额度不足。 (${status})`, status);
  if (status === 429) return new YanCoreError("rate_limited", "请求过于频繁。", status);
  if (status >= 502 && status <= 504) return new YanCoreError(status === 504 ? "timeout" : "upstream_unavailable", "模型服务暂时不可用。", status);
  return new YanCoreError("invalid_response", "网关响应无效。", status);
}
async function json(fetcher: typeof fetch, endpoint: URL, init: RequestInit, timeout: number): Promise<{ response: Response; body: any }> {
  let response: Response;
  try { response = await fetcher(endpoint, { ...init, signal: init.signal ?? AbortSignal.timeout(timeout) }); }
  catch (error) { if (error instanceof DOMException && error.name === "TimeoutError") throw new YanCoreError("timeout", "网关请求超时。"); throw new YanCoreError("upstream_unavailable", "网关暂时不可用。"); }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false) throw classify(response.status, body);
  return { response, body };
}
export type YanCoreGateway = { exchange(subjectToken: string): Promise<GatewayExchange>; capabilities(grant: string): Promise<GatewayCapability[]>; chat(grant: string, request: GatewayChatRequest, stream?: boolean): Promise<Response>; embeddings(grant: string, model: string, inputs: string[]): Promise<GatewayEmbedding>; balance(grant: string): Promise<GatewayBalance>; ledger(grant: string, page: number, pageSize: number): Promise<{ entries: GatewayLedgerEntry[]; total: number }>; keys(grant: string): Promise<GatewayKey[]>; createKey(grant: string, input: { name: string; models: string; remainQuota: number; expiredTime: number }): Promise<GatewayKeyCreate>; revokeKey(grant: string, id: string): Promise<void> };

export function createYanCoreGateway(base: URL, fetcher: typeof fetch = fetch, exchangeAuth?: { id: string; secret: string }): YanCoreGateway {
  const auth = exchangeAuth ? Buffer.from(exchangeAuth.id + ":" + exchangeAuth.secret).toString("base64") : "";
  const call = (path: string, grant: string, init: RequestInit = {}, timeout = 10_000) => json(fetcher, new URL(path, base), { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${grant}`, "X-YanCore-Application": "ai-web" } }, timeout);
  return {
    async exchange(subjectToken) { const { body } = await json(fetcher, new URL("/api/yancore/subject-exchange", base), { method: "POST", headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" }, body: JSON.stringify({ subject_token: subjectToken, ttl: 900 }) }, 8_000); const s = body?.data?.subject, c = body?.data?.credential; if (typeof body?.data?.grant !== "string" || typeof s?.user_id !== "number" || s.application !== "ai-web" || s.audience !== "yanchuaner-ai" || typeof s.scopes !== "string" || typeof s.expires_at !== "number" || typeof c?.access_key !== "string" || !Array.isArray(c.models) || typeof c.quota_units !== "number") throw new YanCoreError("invalid_response"); return { grant: body.data.grant, userId: s.user_id, application: "ai-web", audience: "yanchuaner-ai", scopes: s.scopes, expiresAt: s.expires_at, accessKey: c.access_key, models: c.models, quotaUnits: c.quota_units }; },
    async capabilities(grant) { const { body } = await call("/api/yancore/capabilities", grant); if (!Array.isArray(body?.data?.items)) throw new YanCoreError("invalid_response"); return body.data.items as GatewayCapability[]; },
    async chat(grant, request, stream = true) { const response = await fetcher(new URL("/v1/chat/completions", base), { method: "POST", headers: { Authorization: `Bearer ${grant}`, Accept: stream ? "text/event-stream" : "application/json", "Content-Type": "application/json", "X-YanCore-Application": "ai-web" }, body: JSON.stringify({ ...request, stream }), signal: AbortSignal.timeout(stream ? 120_000 : 30_000) }).catch(() => { throw new YanCoreError("timeout"); }); if (!response.ok) { const body = await response.json().catch(() => null); throw classify(response.status, body); } if (stream && !(response.headers.get("content-type") || "").startsWith("text/event-stream")) throw new YanCoreError("invalid_response"); return response; },
    async embeddings(grant, model, inputs) { const { body } = await call("/v1/embeddings", grant, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model, input: inputs }) }); if (!Array.isArray(body?.data) || body.data.length !== inputs.length) throw new YanCoreError("invalid_response"); const vectors = body.data.slice().sort((a: any, b: any) => (a.index ?? 0) - (b.index ?? 0)).map((x: any) => { if (!Array.isArray(x.embedding) || !x.embedding.every((n: unknown) => typeof n === "number")) throw new YanCoreError("invalid_response"); return x.embedding; }); return { model: typeof body.model === "string" ? body.model : model, vectors, usage: { prompt_tokens: body.usage?.prompt_tokens ?? 0, total_tokens: body.usage?.total_tokens ?? 0 } }; },
    async balance(grant) { const { body } = await call("/api/yancore/grants/introspect", grant, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audience: "yanchuaner-ai" }) }); if (typeof body?.data?.account?.balance_units !== "number") throw new YanCoreError("invalid_response"); return { userId: body.data.account.user_id ?? 0, balanceUnits: body.data.account.balance_units }; },
    async ledger(grant, page, pageSize) { const { body } = await call(`/api/yancore/me/ledger?page=${page}&pageSize=${pageSize}`, grant); if (!Array.isArray(body?.data?.items)) throw new YanCoreError("invalid_response"); return { entries: body.data.items, total: body.data.total ?? body.data.items.length }; },
    async keys(grant) { const { body } = await call("/api/yancore/me/keys?page=1&pageSize=50", grant); if (!Array.isArray(body?.data?.items)) throw new YanCoreError("invalid_response"); return body.data.items; },
    async createKey(grant, input) { const { body } = await call("/api/yancore/me/keys", grant, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: input.name, expired_time: input.expiredTime, remain_quota: input.remainQuota, unlimited_quota: false, model_limits_enabled: true, model_limits: input.models }) }); if (typeof body?.data?.key !== "string" || !body.data.token) throw new YanCoreError("invalid_response"); return { key: body.data.key, token: body.data.token }; },
    async revokeKey(grant, id) { await call(`/api/yancore/me/keys/${encodeURIComponent(id)}`, grant, { method: "DELETE" }); },
  };
}
