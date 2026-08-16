# 计费与账本

额度、预扣、结算与退款全部发生在 `api.yanchuaner.cn` 网关。本仓只传递请求标识、展示账本投影，并防止同一逻辑请求重复进入网关。

## 请求链路

```text
Browser
  ↓ X-Client-Request-ID / X-Trace-ID
AI Web BFF（幂等去重）
  ↓ Bearer accessKey
api.yanchuaner.cn
  ↓ request_id
reserve → settlement / refund
  ↓ quota_ledger_entries
ledger
```

## 幂等

`apps/ai-web/src/lib/request-dedupe.ts` 在 BFF 维护 `client_request_id → {pending,billed,failed}` 注册表（TTL 10 分钟）：

| 状态 | 含义 | 同键重试 |
| --- | --- | --- |
| `pending` | 已进入网关但结果未知（进行中/连接中断） | 返回 409 |
| `billed` | 网关返回可计费响应（SSE/JSON 成功） | 返回 409 |
| `failed` | 网关明确错误（未计费或已退款） | 允许重试 |

网关内部对同一 `request_id` 的 reserve/settlement/refund 幂等；客户端同键重放不会再产生第二个网关请求。

## 账本入口

- `GET /api/me/balance`：余额投影。
- `GET /api/me/ledger?page=&pageSize=`：账本流水（含 `request_id`）。
- `POST /api/admin/quota`：管理员额度操作（仅 admin，要求 reason/reference）。

## 验证

生产受控故障注入：`scripts/acceptance/run-fault-injection.mjs`（quota-failure、rate-limit、upstream-failure、credential-revoke、stream-abort），每个场景输出 machine-readable report 并自动清理。

人工核对脚本：`scripts/verify-ai-web-identity.ps1` 关联本地 usage 与网关账本金额。

## 已知缺口

- 去重注册表为单进程内存实现，多实例部署需共享存储。
- TTL 后相同键重发视为新请求。
- 消息 `request_id`/usage 与账本没有定时自动对账，只有人工脚本。
