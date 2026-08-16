// 请求标识：client_request_id 与 trace_id 的生成、规范化与脱敏。
// 标识只用于关联与排障，不编码主体信息、凭据或消息内容。

export type RequestIdBundle = {
  clientRequestId: string;
  traceId: string;
};

export function createClientRequestId(): string {
  return crypto.randomUUID();
}

export function createTraceId(): string {
  return crypto.randomUUID();
}

export function normalizeRequestId(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 128) return undefined;
  // 只允许可打印 ASCII：避免换行注入日志，也避免把中文或主体信息带进标识。
  if (!/^[\x21-\x7e]+$/.test(trimmed)) return undefined;
  return trimmed;
}

export function resolveRequestIds(
  clientRequestId: string | null | undefined,
  traceId: string | null | undefined,
): RequestIdBundle {
  return {
    clientRequestId: normalizeRequestId(clientRequestId) ?? createClientRequestId(),
    traceId: normalizeRequestId(traceId) ?? createTraceId(),
  };
}
