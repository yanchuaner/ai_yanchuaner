import { YanCoreError, type YanCoreErrorCode } from "@/lib/yancore-gateway";

const mapping: Record<YanCoreErrorCode, { status: number; message: string }> = {
  unauthenticated: { status: 401, message: "登录会话已失效。" },
  forbidden: { status: 403, message: "无权执行此操作。" },
  not_found: { status: 404, message: "请求的资源不存在。" },
  quota_exhausted: { status: 402, message: "公益额度不足。" },
  rate_limited: { status: 429, message: "请求过于频繁，请稍后重试。" },
  upstream_unavailable: { status: 502, message: "网关服务暂时不可用。" },
  timeout: { status: 504, message: "网关请求超时。" },
  invalid_response: { status: 502, message: "网关响应无效。" },
  internal_error: { status: 502, message: "服务暂时不可用。" },
};

export interface YanCoreHttpError {
  status: number;
  body: { error: string; code: YanCoreErrorCode };
  clearSession: boolean;
}

export function mapYanCoreError(error: unknown): YanCoreHttpError {
  const gatewayError = error instanceof YanCoreError ? error : new YanCoreError("internal_error");
  const mapped = mapping[gatewayError.code];
  const status = gatewayError.code === "upstream_unavailable" && gatewayError.status === 503 ? 503 : mapped.status;

  return {
    status,
    body: { error: mapped.message, code: gatewayError.code },
    clearSession: gatewayError.code === "unauthenticated",
  };
}
