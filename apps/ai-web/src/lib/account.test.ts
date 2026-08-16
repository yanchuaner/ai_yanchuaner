import assert from "node:assert/strict";
import test from "node:test";
import {
  AccountActionError,
  createAccountKey,
  grantQuota,
  listAccountKeys,
  loadAccountBalance,
  loadAccountLedger,
  loadAccountSession,
  logout,
  revokeAccountKey,
} from "./account";

const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

const sessionBody = {
  authenticated: true,
  identity: { name: "张三", role: "admin" },
  subject: { userId: 7, scopes: "ai.chat", audience: "yanchuaner-ai" },
  models: ["deepseek-v4-flash", "deepseek-v4-pro"],
  sessionQuotaUnits: 1000,
  expiresAt: 1234567890,
};

test("loadAccountSession maps an authenticated session to typed fields", async () => {
  const result = await loadAccountSession(async () => json(sessionBody));
  assert.equal(result.status, "authenticated");
  if (result.status !== "authenticated") return;
  assert.equal(result.session.identity.name, "张三");
  assert.equal(result.session.subject.userId, 7);
  assert.deepEqual(result.session.models, ["deepseek-v4-flash", "deepseek-v4-pro"]);
});

test("loadAccountSession treats 401 as anonymous", async () => {
  const result = await loadAccountSession(async () => json({ error: "登录会话已失效。" }, 401));
  assert.deepEqual(result, { status: "anonymous" });
});

test("loadAccountSession reports network failure without claiming anonymous", async () => {
  const result = await loadAccountSession(async () => {
    throw new Error("offline");
  });
  assert.equal(result.status, "unavailable");
  if (result.status === "unavailable") assert.equal(result.message, "网络请求失败。");
});

test("loadAccountSession rejects malformed session as unavailable", async () => {
  const result = await loadAccountSession(async () => json({ models: [] }));
  assert.equal(result.status, "unavailable");
});

test("loadAccountBalance parses balance and maps stable errors", async () => {
  assert.deepEqual(await loadAccountBalance(async () => json({ userId: 7, balanceUnits: 42 })), {
    userId: 7,
    balanceUnits: 42,
  });
  for (const [status, code] of [
    [401, "unauthenticated"],
    [403, "forbidden"],
    [409, "conflict"],
    [500, "unavailable"],
    [400, "invalid"],
  ] as const) {
    await assert.rejects(
      loadAccountBalance(async () => json({ error: "失败" }, status)),
      (error: unknown) => error instanceof AccountActionError && error.code === code && error.status === status,
    );
  }
  await assert.rejects(
    loadAccountBalance(async () => json({})),
    (error: unknown) => error instanceof AccountActionError && error.code === "invalid",
  );
});

test("loadAccountLedger normalizes gateway snake_case to domain fields", async () => {
  const page = await loadAccountLedger(
    2,
    10,
    async () =>
      json({
        entries: [
          {
            id: 1,
            entry_type: "consume",
            funding_source: "public_benefit",
            amount: -5,
            balance_after: 95,
            reason: "对话",
            request_id: "req-1",
            created_at: 1700000000,
          },
        ],
        total: 1,
        page: 2,
        pageSize: 10,
      }),
  );
  assert.equal(page.total, 1);
  assert.equal(page.entries[0].entryType, "consume");
  assert.equal(page.entries[0].fundingSource, "public_benefit");
  assert.equal(page.entries[0].requestId, "req-1");
  assert.equal(page.entries[0].createdAt, 1700000000);
});

test("loadAccountLedger rejects malformed entries", async () => {
  await assert.rejects(
    loadAccountLedger(1, 20, async () => json({ entries: [{ id: 1 }] })),
    (error: unknown) => error instanceof AccountActionError && error.code === "invalid",
  );
});

test("listAccountKeys normalizes gateway fields", async () => {
  const keys = await listAccountKeys(
    async () =>
      json({
        keys: [
          {
            id: 3,
            name: "测试",
            key: "sk-yc_test",
            status: 1,
            model_limits_enabled: true,
            model_limits: "deepseek-v4-flash",
            remain_quota: 100,
            unlimited_quota: false,
            expired_time: 1800000000,
            created_time: 1700000000,
          },
        ],
      }),
  );
  assert.equal(keys[0].modelLimitsEnabled, true);
  assert.equal(keys[0].modelLimits, "deepseek-v4-flash");
  assert.equal(keys[0].remainQuota, 100);
  assert.equal(keys[0].expiredTime, 1800000000);
});

test("listAccountKeys rejects invalid key entries", async () => {
  await assert.rejects(
    listAccountKeys(async () => json({ keys: [{ id: "not-number" }] })),
    (error: unknown) => error instanceof AccountActionError && error.code === "invalid",
  );
});

test("createAccountKey posts comma-joined models and returns normalized key", async () => {
  let seenUrl = "";
  let seenBody = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenBody = String(init?.body);
    return json({
      key: "sk-yc_new",
      token: {
        id: 9,
        name: "测试",
        key: "sk-yc_new",
        status: 1,
        model_limits_enabled: true,
        model_limits: "deepseek-v4-flash,deepseek-v4-pro",
        remain_quota: 1000,
        unlimited_quota: false,
        expired_time: 1900000000,
        created_time: 1800000000,
      },
    });
  };
  const before = Math.floor(Date.now() / 1000);
  const result = await createAccountKey(
    { name: "测试", models: ["deepseek-v4-flash", "deepseek-v4-pro"], remainQuota: 1000, expiryDays: 30 },
    fetcher,
  );
  assert.equal(seenUrl, "/api/me/keys");
  const parsed = JSON.parse(seenBody) as Record<string, unknown>;
  assert.equal(parsed.name, "测试");
  assert.equal(parsed.models, "deepseek-v4-flash,deepseek-v4-pro");
  assert.equal(parsed.remainQuota, 1000);
  assert.ok(typeof parsed.expiredTime === "number" && (parsed.expiredTime as number) >= before + 29 * 86400);
  assert.equal(result.key, "sk-yc_new");
  assert.equal(result.token.modelLimits, "deepseek-v4-flash,deepseek-v4-pro");
  assert.doesNotMatch(seenBody, /sk-yc_new/);
});

test("revokeAccountKey sends DELETE to the target key", async () => {
  let seenUrl = "";
  let seenMethod = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenMethod = init?.method ?? "";
    return json({ success: true });
  };
  await revokeAccountKey(42, fetcher);
  assert.equal(seenUrl, "/api/me/keys/42");
  assert.equal(seenMethod, "DELETE");
});

test("grantQuota posts the typed input and returns normalized result", async () => {
  let seenUrl = "";
  let seenBody = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenBody = String(init?.body);
    return json({ entryId: 8, balanceAfter: 999, idempotencyKey: "wx-1" });
  };
  const result = await grantQuota(
    { userId: 7, action: "grant", amount: 100, reason: "线下收款", reference: "wx-1" },
    fetcher,
  );
  assert.equal(seenUrl, "/api/admin/quota");
  assert.deepEqual(JSON.parse(seenBody), {
    userId: 7,
    action: "grant",
    amount: 100,
    reason: "线下收款",
    reference: "wx-1",
  });
  assert.deepEqual(result, { entryId: 8, balanceAfter: 999, idempotencyKey: "wx-1" });
});

test("logout posts to the auth logout endpoint", async () => {
  let seenUrl = "";
  let seenMethod = "";
  const fetcher: typeof fetch = async (input, init) => {
    seenUrl = String(input);
    seenMethod = init?.method ?? "";
    return json({ authenticated: false });
  };
  await logout(fetcher);
  assert.equal(seenUrl, "/api/auth/logout");
  assert.equal(seenMethod, "POST");
});
