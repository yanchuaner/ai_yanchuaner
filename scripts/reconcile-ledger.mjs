// 账本对账：本地消息 request_id/usage 与网关 logs/quota_ledger_entries 自动核对。
// 纯比较逻辑见 buildReport，供自动化测试覆盖；CLI 负责从生产拉取证据。

import { execSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const SSH_HOST = process.env.SSH_HOST || "root@121.37.68.136";
const API_CONTAINER = process.env.API_CONTAINER || "api-yanchuaner-new-api-1";
const CONTROL_DB = process.env.CONTROL_DB_CONTAINER || "api-yanchuaner-control-db-1";
const AI_WEB_CONTAINER = process.env.AI_WEB_CONTAINER || "ai-yanchuaner-ai-web-1";

function remote(cmd) {
  if (process.argv.includes("--local")) {
    return execSync(cmd, { encoding: "utf8" }).trim();
  }
  const wrapped = `"${cmd.replace(/"/g, '\\"')}"`;
  return execSync(`ssh -o BatchMode=yes ${SSH_HOST} ${wrapped}`, { encoding: "utf8" }).trim();
}

function terminalState(entries) {
  if (entries.some((entry) => entry.entry_type === "settlement")) return "settlement";
  if (entries.some((entry) => entry.entry_type === "refund")) return "refund";
  if (entries.some((entry) => entry.entry_type === "reserve")) return "reserve";
  return "none";
}

export function buildReport({
  localMessages,
  gatewayLogs,
  ledgerEntries,
  graceMs = 10 * 60 * 1000,
  now = Date.now(),
}) {
  const mismatches = [];
  const logsByRequestId = new Map();
  for (const log of gatewayLogs) logsByRequestId.set(log.request_id, log);
  const ledgerByRequestId = new Map();
  for (const entry of ledgerEntries) {
    const list = ledgerByRequestId.get(entry.request_id) ?? [];
    list.push(entry);
    ledgerByRequestId.set(entry.request_id, list);
  }

  const withRequestId = localMessages.filter((message) => message.requestId);
  for (const message of withRequestId) {
    const log = logsByRequestId.get(message.requestId);
    if (!log) {
      mismatches.push({ code: "missing_gateway_log", requestId: message.requestId, messageId: message.messageId });
      continue;
    }
    if (message.usage) {
      if (message.usage.prompt !== log.prompt_tokens || message.usage.completion !== log.completion_tokens) {
        mismatches.push({
          code: "usage_mismatch",
          requestId: message.requestId,
          messageId: message.messageId,
          local: message.usage,
          gateway: { prompt_tokens: log.prompt_tokens, completion_tokens: log.completion_tokens },
        });
      }
    }
    const entries = ledgerByRequestId.get(message.requestId) ?? [];
    const state = terminalState(entries);
    if (state === "none") {
      mismatches.push({ code: "missing_ledger", requestId: message.requestId, messageId: message.messageId });
    } else if (state === "reserve") {
      const createdAt = Number(log.created_at || 0);
      if (now - createdAt > graceMs) {
        mismatches.push({ code: "unsettled_reserve", requestId: message.requestId, messageId: message.messageId });
      }
    } else {
      const finalCharge = -entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
      if (Number.isFinite(log.quota) && finalCharge !== Number(log.quota)) {
        mismatches.push({
          code: "quota_mismatch",
          requestId: message.requestId,
          messageId: message.messageId,
          ledgerCharge: finalCharge,
          logQuota: log.quota,
        });
      }
    }
  }

  return {
    checked: {
      localMessages: localMessages.length,
      withRequestId: withRequestId.length,
      gatewayLogs: gatewayLogs.length,
      ledgerEntries: ledgerEntries.length,
    },
    mismatches,
    ok: mismatches.length === 0,
  };
}

async function readLocalMessages(dataDir) {
  const dir = path.join(dataDir, "conversations");
  let files = [];
  try {
    files = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  } catch {
    return [];
  }
  const messages = [];
  for (const file of files) {
    const store = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    for (const conversation of store.conversations ?? []) {
      for (const message of conversation.messages ?? []) {
        messages.push({
          messageId: message.id,
          requestId: message.requestId,
          usage: message.usage,
        });
      }
    }
  }
  return messages;
}

async function fetchRemote() {
  const localRaw = remote(
    `docker exec ${AI_WEB_CONTAINER} node -e 'const fs=require("fs");const out=[];for(const f of fs.readdirSync("/data/conversations")){const s=JSON.parse(fs.readFileSync("/data/conversations/"+f,"utf8"));for(const c of (s.conversations||[])){for(const m of (c.messages||[])){out.push({messageId:m.id,requestId:m.requestId,usage:m.usage})}}}process.stdout.write(JSON.stringify(out))'`,
  );
  const localMessages = JSON.parse(localRaw);
  const ids = [...new Set(localMessages.map((message) => message.requestId).filter(Boolean))];
  if (ids.length === 0) {
    return { localMessages, gatewayLogs: [], ledgerEntries: [] };
  }
  const idList = ids.map((id) => `'${id}'`).join(",");
  const logsRaw = remote(
    `docker exec ${CONTROL_DB} psql -U new_api -d new_api -t -A -F '|' -c "SELECT request_id, prompt_tokens, completion_tokens, quota, created_at FROM logs WHERE request_id IN (${idList})"`,
  );
  const ledgerRaw = remote(
    `docker exec ${CONTROL_DB} psql -U new_api -d new_api -t -A -F '|' -c "SELECT request_id, entry_type, amount FROM quota_ledger_entries WHERE request_id IN (${idList}) ORDER BY id"`,
  );
  const gatewayLogs = logsRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [request_id, prompt_tokens, completion_tokens, quota, created_at] = line.split("|");
      return {
        request_id,
        prompt_tokens: Number(prompt_tokens),
        completion_tokens: Number(completion_tokens),
        quota: Number(quota),
        created_at: Number(created_at),
      };
    });
  const ledgerEntries = ledgerRaw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [request_id, entry_type, amount] = line.split("|");
      return { request_id, entry_type, amount: Number(amount) };
    });
  return { localMessages, gatewayLogs, ledgerEntries };
}

async function main() {
  const dataDirArg = process.argv.find((arg) => arg.startsWith("--data-dir="))?.split("=")[1];
  if (process.argv.includes("--local") && dataDirArg) {
    throw new Error("--local 与 --data-dir 不能同时使用");
  }
  const graceMinutes = Number(
    process.argv.find((arg) => arg.startsWith("--grace-minutes="))?.split("=")[1] || 10,
  );
  let evidence;
  if (dataDirArg) {
    evidence = { localMessages: await readLocalMessages(dataDirArg), gatewayLogs: [], ledgerEntries: [] };
  } else {
    evidence = await fetchRemote();
  }
  const report = buildReport({ ...evidence, graceMs: graceMinutes * 60 * 1000 });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
