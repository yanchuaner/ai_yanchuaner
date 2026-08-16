// 跨请求计费幂等：同一 client_request_id 在 TTL 内只允许一次进入网关。
// 网关侧对同请求的 reserve/settlement/refund 已幂等，但相同逻辑提交
// 会生成新的 request_id 并再次扣费；BFF 在转发前去重，避免重试双扣。
//
// 状态语义：
// - pending：请求已进入网关但结果未知（进行中或连接中断），重复提交拒绝；
// - billed：网关已返回可计费响应（含 SSE 开始/JSON 成功），重复提交拒绝；
// - failed：网关返回了明确的错误响应（未计费或已退款），允许同键重试。

export type RequestDedupeStatus = "pending" | "billed" | "failed";

export type RequestDedupeCheck =
  | { allowed: true }
  | { allowed: false; status: "pending" | "billed" };

export type RequestDedupe = {
  begin(clientRequestId: string): RequestDedupeCheck;
  finish(clientRequestId: string, outcome: "billed" | "failed" | "unknown"): void;
};

export function createRequestDedupe(options?: {
  ttlMs?: number;
  now?: () => number;
}): RequestDedupe {
  const ttlMs = options?.ttlMs ?? 10 * 60 * 1000;
  const now = options?.now ?? Date.now;
  const entries = new Map<string, { status: RequestDedupeStatus; updatedAt: number }>();

  function prune(): void {
    const cutoff = now() - ttlMs;
    for (const [key, entry] of entries) {
      if (entry.updatedAt < cutoff) entries.delete(key);
    }
  }

  return {
    begin(clientRequestId) {
      prune();
      const existing = entries.get(clientRequestId);
      if (existing && existing.status !== "failed") {
        return { allowed: false, status: existing.status };
      }
      entries.set(clientRequestId, { status: "pending", updatedAt: now() });
      return { allowed: true };
    },
    finish(clientRequestId, outcome) {
      const entry = entries.get(clientRequestId);
      if (!entry) return;
      if (outcome === "unknown") {
        // 连接中断等未知结果：保持 pending，TTL 内阻止同键重放。
        entry.updatedAt = now();
        return;
      }
      entry.status = outcome === "billed" ? "billed" : "failed";
      entry.updatedAt = now();
    },
  };
}

export const requestDedupe = createRequestDedupe();
