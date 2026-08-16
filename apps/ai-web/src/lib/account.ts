// 账户边界：会话、余额、流水、开发者 Key 与管理员额度。
// 页面只消费归一后的领域类型；BFF 返回的网关 DTO 与错误语义在这里收敛。

export type AccountSession = {
  identity: { name: string; role: string };
  subject: { userId: number; scopes: string; audience: string };
  models: string[];
  sessionQuotaUnits: number;
  expiresAt: number;
};

export type SessionLoadResult =
  | { status: "authenticated"; session: AccountSession }
  | { status: "anonymous" }
  | { status: "unavailable"; message: string };

export type AccountBalance = {
  userId: number;
  balanceUnits: number;
};

export type AccountLedgerEntry = {
  id: number;
  entryType: string;
  fundingSource: string;
  amount: number;
  balanceAfter: number;
  reason: string;
  requestId: string;
  createdAt: number;
};

export type AccountLedgerPage = {
  entries: AccountLedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export type AccountApiKey = {
  id: number;
  name: string;
  key: string;
  status: number;
  modelLimitsEnabled: boolean;
  modelLimits: string;
  remainQuota: number;
  unlimitedQuota: boolean;
  expiredTime: number;
  createdTime: number;
};

export type AccountKeyCreate = {
  key: string;
  token: AccountApiKey;
};

export type AccountQuotaInput = {
  userId: number;
  action: "grant" | "adjust";
  amount: number;
  reason: string;
  reference: string;
};

export type AccountQuotaResult = {
  entryId?: number;
  balanceAfter: number;
  idempotencyKey?: string;
};

export type AccountActionCode =
  | "unauthenticated"
  | "forbidden"
  | "conflict"
  | "invalid"
  | "unavailable"
  | "network";

export class AccountActionError extends Error {
  constructor(
    public readonly code: AccountActionCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AccountActionError";
  }
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
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

async function accountRequest<T>(
  path: string,
  init: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(path, { cache: "no-store", ...init });
  } catch {
    throw new AccountActionError("network", "网络请求失败。");
  }
  const body = await readBody(response);
  if (response.status === 401) throw new AccountActionError("unauthenticated", "登录会话已失效。", 401);
  if (response.status === 403) throw new AccountActionError("forbidden", "无权执行该操作。", 403);
  if (!response.ok) {
    const code = response.status === 409 ? "conflict" : response.status >= 500 ? "unavailable" : "invalid";
    const message =
      response.status >= 500
        ? "服务暂时不可用。"
        : messageFrom(body, code === "conflict" ? "凭证已使用。" : "操作失败。");
    throw new AccountActionError(code, message, response.status);
  }
  if (body === null) throw new AccountActionError("invalid", "接口返回格式无效。");
  return body as T;
}

function parseSession(body: JsonRecord): AccountSession {
  const identity = body.identity;
  const subject = body.subject;
  if (
    !isRecord(identity) ||
    typeof identity.name !== "string" ||
    typeof identity.role !== "string" ||
    !isRecord(subject) ||
    typeof subject.userId !== "number" ||
    typeof subject.scopes !== "string" ||
    typeof subject.audience !== "string" ||
    !Array.isArray(body.models) ||
    !body.models.every((item) => typeof item === "string") ||
    typeof body.sessionQuotaUnits !== "number" ||
    typeof body.expiresAt !== "number"
  ) {
    throw new AccountActionError("invalid", "会话响应格式无效。");
  }
  return {
    identity: { name: identity.name, role: identity.role },
    subject: {
      userId: subject.userId,
      scopes: subject.scopes,
      audience: subject.audience,
    },
    models: body.models,
    sessionQuotaUnits: body.sessionQuotaUnits,
    expiresAt: body.expiresAt,
  };
}

function parseLedgerEntry(value: unknown): AccountLedgerEntry {
  if (
    !isRecord(value) ||
    typeof value.id !== "number" ||
    typeof value.entry_type !== "string" ||
    typeof value.funding_source !== "string" ||
    typeof value.amount !== "number" ||
    typeof value.balance_after !== "number" ||
    typeof value.reason !== "string" ||
    typeof value.request_id !== "string" ||
    typeof value.created_at !== "number"
  ) {
    throw new AccountActionError("invalid", "流水条目格式无效。");
  }
  return {
    id: value.id,
    entryType: value.entry_type,
    fundingSource: value.funding_source,
    amount: value.amount,
    balanceAfter: value.balance_after,
    reason: value.reason,
    requestId: value.request_id,
    createdAt: value.created_at,
  };
}

function parseApiKey(value: unknown): AccountApiKey {
  if (
    !isRecord(value) ||
    typeof value.id !== "number" ||
    typeof value.name !== "string" ||
    typeof value.key !== "string" ||
    typeof value.status !== "number" ||
    typeof value.model_limits_enabled !== "boolean" ||
    typeof value.model_limits !== "string" ||
    typeof value.remain_quota !== "number" ||
    typeof value.unlimited_quota !== "boolean" ||
    typeof value.expired_time !== "number" ||
    typeof value.created_time !== "number"
  ) {
    throw new AccountActionError("invalid", "Key 条目格式无效。");
  }
  return {
    id: value.id,
    name: value.name,
    key: value.key,
    status: value.status,
    modelLimitsEnabled: value.model_limits_enabled,
    modelLimits: value.model_limits,
    remainQuota: value.remain_quota,
    unlimitedQuota: value.unlimited_quota,
    expiredTime: value.expired_time,
    createdTime: value.created_time,
  };
}

export async function loadAccountSession(fetcher: typeof fetch = fetch): Promise<SessionLoadResult> {
  try {
    const body = await accountRequest<JsonRecord>("/api/session", {}, fetcher);
    return { status: "authenticated", session: parseSession(body) };
  } catch (error) {
    if (error instanceof AccountActionError && error.code === "unauthenticated") {
      return { status: "anonymous" };
    }
    return {
      status: "unavailable",
      message: error instanceof Error ? error.message : "暂时无法确认登录状态。",
    };
  }
}

export async function loadAccountBalance(fetcher: typeof fetch = fetch): Promise<AccountBalance> {
  const body = await accountRequest<JsonRecord>("/api/me/balance", {}, fetcher);
  if (typeof body.userId !== "number" || typeof body.balanceUnits !== "number") {
    throw new AccountActionError("invalid", "余额响应格式无效。");
  }
  return { userId: body.userId, balanceUnits: body.balanceUnits };
}

export async function loadAccountLedger(
  page = 1,
  pageSize = 20,
  fetcher: typeof fetch = fetch,
): Promise<AccountLedgerPage> {
  const body = await accountRequest<JsonRecord>(
    `/api/me/ledger?page=${page}&pageSize=${pageSize}`,
    {},
    fetcher,
  );
  if (!Array.isArray(body.entries)) throw new AccountActionError("invalid", "流水响应格式无效。");
  const entries = body.entries.map(parseLedgerEntry);
  return {
    entries,
    total: typeof body.total === "number" ? body.total : entries.length,
    page: typeof body.page === "number" ? body.page : page,
    pageSize: typeof body.pageSize === "number" ? body.pageSize : pageSize,
  };
}

export async function listAccountKeys(fetcher: typeof fetch = fetch): Promise<AccountApiKey[]> {
  const body = await accountRequest<JsonRecord>("/api/me/keys", {}, fetcher);
  if (!Array.isArray(body.keys)) throw new AccountActionError("invalid", "Key 列表响应格式无效。");
  return body.keys.map(parseApiKey);
}

export async function createAccountKey(
  input: { name: string; models: string[]; remainQuota: number; expiryDays: number },
  fetcher: typeof fetch = fetch,
): Promise<AccountKeyCreate> {
  const body = await accountRequest<JsonRecord>(
    "/api/me/keys",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        models: input.models.join(","),
        remainQuota: input.remainQuota,
        expiredTime: Math.floor(Date.now() / 1000) + input.expiryDays * 86400,
      }),
    },
    fetcher,
  );
  if (typeof body.key !== "string" || !isRecord(body.token)) {
    throw new AccountActionError("invalid", "Key 创建响应格式无效。");
  }
  return { key: body.key, token: parseApiKey(body.token) };
}

export async function revokeAccountKey(id: number, fetcher: typeof fetch = fetch): Promise<void> {
  await accountRequest<JsonRecord>(`/api/me/keys/${id}`, { method: "DELETE" }, fetcher);
}

export async function grantQuota(
  input: AccountQuotaInput,
  fetcher: typeof fetch = fetch,
): Promise<AccountQuotaResult> {
  const body = await accountRequest<JsonRecord>(
    "/api/admin/quota",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
    fetcher,
  );
  if (typeof body.balanceAfter !== "number") {
    throw new AccountActionError("invalid", "额度发放响应格式无效。");
  }
  return {
    entryId: typeof body.entryId === "number" ? body.entryId : undefined,
    balanceAfter: body.balanceAfter,
    idempotencyKey: typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
  };
}

export async function logout(fetcher: typeof fetch = fetch): Promise<void> {
  await accountRequest<JsonRecord>("/api/auth/logout", { method: "POST" }, fetcher);
}
