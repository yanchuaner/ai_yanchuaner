// AI-61 故障注入验收脚本：创建测试资源 → 请求 → 验证 → 自动清理 → JSON report。
// 用法：node scripts/acceptance/run-fault-injection.mjs --scenario quota-failure

import { execSync } from "node:child_process";
import crypto from "node:crypto";

const SSH_HOST = process.env.SSH_HOST || "root@121.37.68.136";
const API_BASE = process.env.API_BASE || "http://127.0.0.1:3101";
const CONTROL_DB = process.env.CONTROL_DB_CONTAINER || "api-yanchuaner-control-db-1";
const API_CONTAINER = process.env.API_CONTAINER || "api-yanchuaner-new-api-1";
const API_SERVICE = process.env.API_SERVICE || "new-api";
const REDIS_CONTAINER = process.env.REDIS_CONTAINER || "api-yanchuaner-redis-1";
const DEPLOY_DIR = process.env.API_DEPLOY_DIR || "/opt/yanchuaner/api_yanchuaner/deploy";

function ssh(cmd) {
  return execSync(`ssh -o BatchMode=yes ${SSH_HOST} ${cmd}`, { encoding: "utf8" }).trim();
}

function psql(sql) {
  return ssh(
    `"docker exec ${CONTROL_DB} psql -U new_api -d new_api -t -A -c \\"${sql.replace(/"/g, '\\"')}\\""`,
  ).trim();
}

function request(presented, body, extra = "") {
  const b64 = Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf8").toString("base64");
  return ssh(
    `"echo ${b64} | base64 -d > /tmp/ai61-body.json && curl -s -o /tmp/ai61-fault.json -w '%{http_code}' -X POST ${API_BASE}/v1/chat/completions -H 'Authorization: Bearer ${presented}' -H 'Content-Type: application/json' -d @/tmp/ai61-body.json ${extra}"`,
  ).trim();
}

function bodyText() {
  return ssh(`"cat /tmp/ai61-fault.json"`).slice(0, 300);
}

function report(scenario, passed, details) {
  console.log(JSON.stringify({ scenario, passed, details, finishedAt: new Date().toISOString() }, null, 2));
  if (!passed) process.exitCode = 1;
}

async function quotaFailure() {
  const token = crypto.randomBytes(16).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  psql("DELETE FROM tokens WHERE name='ai61-quota-script';");
  psql(
    `INSERT INTO tokens (user_id, key, key_hash_enabled, status, name, created_time, expired_time, remain_quota, unlimited_quota, model_limits_enabled, model_limits) VALUES (1, '${token}', false, 1, 'ai61-quota-script', ${now}, ${now + 86400}, 1, false, true, 'deepseek-v4-flash');`,
  );
  const tokenId = psql(`SELECT id FROM tokens WHERE key='${token}'`).split("\n").pop().trim();
  const body = { model: "deepseek-v4-flash", messages: [{ role: "user", content: "你好" }] };
  const code = request(`sk-${token}`, body);
  const text = bodyText();
  psql(`DELETE FROM tokens WHERE id=${tokenId}`);
  report("quota-failure", code === "403" && text.includes("pre_consume_token_quota_failed"), { code, body: text });
}

async function upstreamFailure() {
  const token = crypto.randomBytes(16).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  psql("DELETE FROM channels WHERE name='ai61-dead-script'; DELETE FROM tokens WHERE name='ai61-upstream-script';");
  psql(
    `INSERT INTO channels (type, key, status, name, base_url, models, created_time) VALUES (1, 'test', 1, 'ai61-dead-script', 'http://127.0.0.1:39999/v1', 'deepseek-v4-flash', ${now});`,
  );
  const channelId = psql(`SELECT id FROM channels WHERE name='ai61-dead-script'`).split("\n").pop().trim();
  psql(
    `INSERT INTO tokens (user_id, key, key_hash_enabled, status, name, created_time, expired_time, remain_quota, unlimited_quota, model_limits_enabled, model_limits) VALUES (1, '${token}', false, 1, 'ai61-upstream-script', ${now}, ${now + 86400}, 100000, false, true, 'deepseek-v4-flash');`,
  );
  const body = { model: "deepseek-v4-flash", messages: [{ role: "user", content: "你好" }] };
  const code = request(`sk-${token}-${channelId}`, body);
  const text = bodyText();
  psql(`DELETE FROM tokens WHERE key='${token}'; DELETE FROM channels WHERE id=${channelId};`);
  report("upstream-failure", ["500", "502", "503", "504"].includes(code), { code, body: text });
}

async function credentialRevoke() {
  const token = crypto.randomBytes(16).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  psql("DELETE FROM tokens WHERE name='ai61-revoke-script';");
  psql(
    `INSERT INTO tokens (user_id, key, key_hash_enabled, status, name, created_time, expired_time, remain_quota, unlimited_quota, model_limits_enabled, model_limits) VALUES (1, '${token}', false, 1, 'ai61-revoke-script', ${now}, ${now + 86400}, 100000, false, true, 'deepseek-v4-flash');`,
  );
  const tokenId = psql(`SELECT id FROM tokens WHERE key='${token}'`).split("\n").pop().trim();
  const body = { model: "deepseek-v4-flash", messages: [{ role: "user", content: "你好" }] };
  const before = request(`sk-${token}`, body);
  psql(`UPDATE tokens SET key='revoked-${crypto.randomBytes(8).toString("hex")}' WHERE id=${tokenId}`);
  ssh(`bash -s <<'REMOTE'
set -eu
SECRET=$(docker exec ${API_CONTAINER} printenv CRYPTO_SECRET)
RPASS=$(docker exec ${REDIS_CONTAINER} printenv REDIS_PASSWORD)
HMAC=$(printf '%s' '${token}' | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $2}')
docker exec ${REDIS_CONTAINER} redis-cli -a "$RPASS" --no-auth-warning DEL "token:$HMAC"
REMOTE`);
  const after = request(`sk-${token}`, body);
  const text = bodyText();
  psql(`DELETE FROM tokens WHERE id=${tokenId}`);
  report("credential-revoke", before === "200" && after === "401", { before, after, body: text });
}

async function streamAbort() {
  const token = crypto.randomBytes(16).toString("hex");
  const now = Math.floor(Date.now() / 1000);
  psql("DELETE FROM tokens WHERE name='ai61-stream-script';");
  psql(
    `INSERT INTO tokens (user_id, key, key_hash_enabled, status, name, created_time, expired_time, remain_quota, unlimited_quota, model_limits_enabled, model_limits) VALUES (1, '${token}', false, 1, 'ai61-stream-script', ${now}, ${now + 86400}, 100000, false, true, 'deepseek-v4-flash');`,
  );
  const tokenId = psql(`SELECT id FROM tokens WHERE key='${token}'`).split("\n").pop().trim();
  const body = {
    model: "deepseek-v4-flash",
    messages: [{ role: "user", content: "AI-61 断流验收，请输出较长内容" }],
    stream: true,
  };
  try {
    request(`sk-${token}`, body, "--max-time 1");
  } catch {
    // 客户端中止是预期行为。
  }
  await new Promise((resolve) => setTimeout(resolve, 6000));
  const log = psql(
    `SELECT request_id, type FROM logs WHERE token_id=${tokenId} AND model_name='deepseek-v4-flash' ORDER BY id DESC LIMIT 1`,
  ).split("\n").filter(Boolean)[0] || "";
  const requestId = log.split("|")[0] || "";
  const entries = requestId
    ? psql(`SELECT entry_type FROM quota_ledger_entries WHERE request_id='${requestId}' ORDER BY id`).split("\n").filter(Boolean)
    : [];
  psql(`DELETE FROM tokens WHERE id=${tokenId}`);
  report("stream-abort", Boolean(requestId) && entries.length >= 2 && entries.some((e) => e.startsWith("reserve")) && entries.some((e) => e.startsWith("settlement")), { requestId, ledger: entries });
}

async function rateLimit() {
  // 需要临时启用虚拟 Key 策略；脚本会回填保护、测试后恢复。
  const now = Math.floor(Date.now() / 1000);
  const waitApi = () => {
    for (let i = 0; i < 90; i++) {
      try {
        const code = ssh(`"curl -s -o /dev/null -w '%{http_code}' ${API_BASE}/api/status"`);
        if (code === "200") return true;
      } catch {}
      execSync("sleep 1");
    }
    return false;
  };
  let testTokenId = null;
  let passed = false;
  let detail = {};
  try {
    psql(
      `INSERT INTO yan_core_virtual_key_policies (token_id, user_id, provider_scope, max_rpm, max_tpm, max_concurrency, status, version, created_at, updated_at) SELECT id, user_id, 'deepseek', 1000, 10000000, 10, 'active', 1, ${now}, ${now} FROM tokens WHERE key_hash_enabled=true AND deleted_at IS NULL AND id NOT IN (SELECT token_id FROM yan_core_virtual_key_policies);`,
    );
    ssh(`"sed -i 's/^YANCHUANER_VIRTUAL_KEY_POLICY_ENABLED=false/YANCHUANER_VIRTUAL_KEY_POLICY_ENABLED=true/' ${DEPLOY_DIR}/.env"`);
    ssh(`"cd ${DEPLOY_DIR} && docker compose -f compose.yaml -f compose.server.yaml up -d --force-recreate ${API_SERVICE}"`);
    waitApi();
    const secret = crypto.randomBytes(16).toString("hex");
    const presented = "yc_" + secret;
    const hash = "sha256:" + crypto.createHash("sha256").update(presented).digest("hex");
    psql(
      `INSERT INTO tokens (user_id, key, key_hash_enabled, key_display_prefix, key_display_suffix, status, name, created_time, expired_time, remain_quota, unlimited_quota, model_limits_enabled, model_limits) VALUES (1, '${hash}', true, '${presented.slice(0, 10)}', '${presented.slice(-4)}', 1, 'ai61-rate-script', ${now}, ${now + 86400}, 100000, false, true, 'deepseek-v4-flash');`,
    );
    testTokenId = psql(`SELECT id FROM tokens WHERE key='${hash}'`).split("\n").pop().trim();
    psql(
      `INSERT INTO yan_core_virtual_key_policies (token_id, user_id, provider_scope, max_rpm, max_tpm, max_concurrency, status, version, created_at, updated_at) VALUES (${testTokenId}, 1, 'deepseek', 1, 1000000, 1, 'active', 1, ${now}, ${now});`,
    );
    const body = { model: "deepseek-v4-flash", messages: [{ role: "user", content: "你好" }] };
    const first = request(presented, body);
    const second = request(presented, body);
    const secondText = bodyText();
    passed = first === "200" && second === "429" && secondText.includes("RPM limit exceeded");
    detail = { first, second, body: secondText };
  } finally {
    try {
      if (testTokenId) psql(`DELETE FROM yan_core_virtual_key_policies WHERE token_id=${testTokenId}; DELETE FROM tokens WHERE id=${testTokenId};`);
      psql("DELETE FROM yan_core_virtual_key_policies;");
      ssh(`"sed -i 's/^YANCHUANER_VIRTUAL_KEY_POLICY_ENABLED=true/YANCHUANER_VIRTUAL_KEY_POLICY_ENABLED=false/' ${DEPLOY_DIR}/.env"`);
      ssh(`"cd ${DEPLOY_DIR} && docker compose -f compose.yaml -f compose.server.yaml up -d --force-recreate ${API_SERVICE}"`);
      waitApi();
    } catch (error) {
      detail = { ...detail, cleanupError: String(error) };
    }
  }
  report("rate-limit", passed, detail);
}

const scenarioArg = process.argv.find((arg) => arg.startsWith("--scenario="))?.split("=")[1];
const scenarioIndex = process.argv.indexOf("--scenario");
const scenario = scenarioArg || (scenarioIndex >= 0 ? process.argv[scenarioIndex + 1] : process.argv[2]);
const runners = { "quota-failure": quotaFailure, "upstream-failure": upstreamFailure, "credential-revoke": credentialRevoke, "stream-abort": streamAbort, "rate-limit": rateLimit };
if (!runners[scenario]) {
  console.error("未知场景，可用：quota-failure, rate-limit, upstream-failure, credential-revoke, stream-abort");
  process.exit(2);
}
await runners[scenario]();
