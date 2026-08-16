# AI-61 受控真实网关验收记录

日期：2026-08-17
状态：进行中（正向链路已验收，故障注入部分待 API 控制面测试主体）

## 已验证（生产 `ai.yanchuaner.cn` / `api.yanchuaner.cn`）

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 普通聊天 | HTTP 200，返回 request ID | 账本按 request_id 命中 settlement，余额随结算下降 |
| 角色扮演 roleplay/v1 | HTTP 200，request ID 命中账本 | `/api/me/ledger` 可查 |
| 群聊 group/v1 | 调度选出成员，单角色发言 HTTP 200，request ID 命中账本 | `/api/me/ledger` 可查 |
| 会话持久化 | 创建/追加/详情/列表读回正常 | 仓储冒烟 |
| 真实额度耗尽 | 余额 1 的测试 Token 请求返回 403，`pre_consume_token_quota_failed` | 控制面测试 Token，验证后已删除 |

普通聊天账本复验：首次即时查询未命中，等待结算后命中 settlement 与余额变动（`found=2`），说明账本终态为异步结算，验收需按结算窗口复核。

## 待验证（需要 API 控制面测试主体或故障开关）

- 真实限流（429）
- 真实上游失败（502/504）
- 真实超时与浏览器断流后的退款/终态
- 真实会话撤销（停用账号/强制退出后 AI 会话立即失效）

当前 ai-web 个人虚拟 Key 直连 `api.yanchuaner.cn/v1/chat/completions` 返回 `401 Invalid token`，且再次创建测试 Key 时遇到会话失效，无法用现有凭据完成故障注入；这些路径已有隔离/自动测试覆盖（AI-60），但不能替代真实网关验收。

## 验收口径

- 每个付费 request_id 只能有一个账本终态（预留/结算/退款）。
- 群聊一次运行共享 trace，各角色发言独立 request_id。
- 故障注入使用可撤销测试 Key 或获授权测试主体，验收后清理。
