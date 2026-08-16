import assert from "node:assert/strict";
import test from "node:test";
import { createYanCoreGateway, YanCoreError } from "./yancore-gateway";

const base = new URL("https://api.yanchuaner.cn");
const response = (body: unknown, status = 200, headers?: HeadersInit) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

test("subject exchange maps the gateway response to AI types", async () => {
  const fetcher: typeof fetch = async () => response({ success: true, data: { grant: "grant", subject: { user_id: 7, application: "ai-web", audience: "yanchuaner-ai", scopes: "ai.chat", expires_at: 100 }, credential: { access_key: "sk-yc_abc", models: ["deepseek"], quota_units: 5 } } });
  const result = await createYanCoreGateway(base, fetcher, { id: "id", secret: "secret" }).exchange("subject");
  assert.equal(result.userId, 7); assert.deepEqual(result.models, ["deepseek"]);
});

test("capability, balance, ledger and key operations map stable types", async () => {
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("capabilities")) return response({ success: true, data: { items: [{ id: "text.chat.general", version: "1", schema_version: "1.0", modalities: { input: ["text"], output: ["text"] }, streaming: true, billing: { mode: "platform", unit: "token" }, availability: "preview" }] } });
    if (url.includes("introspect")) return response({ success: true, data: { account: { user_id: 1, balance_units: 10 } } });
    if (url.includes("ledger")) return response({ success: true, data: { items: [], total: 0 } });
    if (init?.method === "POST") return response({ success: true, data: { key: "sk", token: { id: 1 } } });
    return response({ success: true, data: { items: [] } });
  };
  const gateway = createYanCoreGateway(base, fetcher);
  assert.equal((await gateway.capabilities("g")).length, 1); assert.equal((await gateway.balance("g")).balanceUnits, 10); assert.equal((await gateway.ledger("g", 1, 20)).total, 0); assert.deepEqual((await gateway.keys("g")), []); assert.equal((await gateway.createKey("g", { name: "n", models: "m", remainQuota: 1, expiredTime: 2 })).key, "sk"); await gateway.revokeKey("g", "1");
});

for (const [status, code] of [[401, "unauthenticated"], [403, "forbidden"], [404, "not_found"], [402, "quota_exhausted"], [429, "rate_limited"], [502, "upstream_unavailable"]] as const) {
  test("maps HTTP " + status + " to " + code, async () => { await assert.rejects(createYanCoreGateway(base, async () => response({ success: false }, status)).balance("g"), (error: YanCoreError) => error.code === code); });
}

test("maps malformed responses to invalid_response", async () => { await assert.rejects(createYanCoreGateway(base, async () => response({ success: true, data: {} })).balance("g"), (error: YanCoreError) => error.code === "invalid_response"); });
test("maps fetch timeout/failure to a stable upstream error", async () => { await assert.rejects(createYanCoreGateway(base, async () => { throw new Error("offline"); }).balance("g"), (error: YanCoreError) => error.code === "upstream_unavailable"); });
