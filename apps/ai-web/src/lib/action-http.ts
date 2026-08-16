// 领域 action 的公共 HTTP 语义：统一错误码、JSON 解析与网络失败映射。

export type ActionErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "invalid"
  | "unavailable"
  | "network";

export class ActionError extends Error {
  constructor(
    public readonly code: ActionErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ActionError";
  }
}

export type JsonRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

async function readBody(response: Response): Promise<JsonRecord | null> {
  return response.json().catch(() => null);
}

function messageFrom(body: JsonRecord | null, fallback: string): string {
  if (body && typeof body.error === "string" && body.error) return body.error;
  if (body && typeof body.message === "string" && body.message) return body.message;
  return fallback;
}

export async function actionRequest<T>(
  path: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(path, { cache: "no-store", ...init });
  } catch {
    throw new ActionError("network", "网络请求失败。");
  }
  const body = await readBody(response);
  if (response.status === 401) throw new ActionError("unauthenticated", "登录会话已失效。", 401);
  if (response.status === 403) throw new ActionError("forbidden", "无权执行该操作。", 403);
  if (response.status === 404) throw new ActionError("not_found", "资源不存在。", 404);
  if (!response.ok) {
    const code = response.status === 409 ? "conflict" : response.status >= 500 ? "unavailable" : "invalid";
    const message =
      response.status >= 500
        ? "服务暂时不可用。"
        : messageFrom(body, code === "conflict" ? "操作冲突。" : "操作失败。");
    throw new ActionError(code, message, response.status);
  }
  if (body === null) throw new ActionError("invalid", "接口返回格式无效。");
  return body as T;
}
