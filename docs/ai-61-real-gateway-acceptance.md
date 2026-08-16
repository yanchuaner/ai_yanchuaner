# AI-61 受控真实网关验收记录

日期：2026-08-17
状态：完成（正向链路与受控故障注入均已验收）

## 已验证（生产 `ai.yanchuaner.cn` / `api.yanchuaner.cn`）

| 场景 | 结果 | 证据 |
| --- | --- | --- |
| 普通聊天 | HTTP 200，返回 request ID | 账本按 request_id 命中 settlement，余额随结算下降 |
| 角色扮演 roleplay/v1 | HTTP 200，request ID 命中账本 | `/api/me/ledger` 可查 |
| 群聊 group/v1 | 调度选出成员，单角色发言 HTTP 200，request ID 命中账本 | `/api/me/ledger` 可查 |
| 会话持久化 | 创建/追加/详情/列表读回正常 | 仓储冒烟 |
| 真实额度耗尽 | 余额 1 的测试 Token 请求返回 403，`pre_consume_token_quota_failed` | 控制面测试 Token，验证后已删除 |
| 真实限流 | MaxRPM=1 虚拟 Key 第二次请求返回 429，`virtual key RPM limit exceeded` | 临时启用策略并回填保护，验证后已恢复 |
| 真实上游失败 | 死渠道返回 500，`do_request_failed` | 测试渠道/Token 已删除 |
| 真实超时/不可用 | 挂起上游返回 500，`do_request_failed` | 测试进程/渠道/Token 已清理 |
| 真实凭证撤销 | 可撤销 Token 验证 200 后，DB 改 Key + 清 Redis 缓存，复请求 401 | 测试 Token 已删除 |
| 真实断流 | 客户端 1-2 秒中止，网关仍产生唯一终态：`reserve -35` + `settlement +3`，无悬挂 | request_id 可查 |

普通聊天账本复验：首次即时查询未命中，等待结算后命中 settlement 与余额变动（`found=2`），说明账本终态为异步结算，验收需按结算窗口复核。

## 待验证（需要 API 控制面测试主体或故障开关）

- 真实限流（429）
- 真实上游失败（502/504）
- 真实超时与浏览器断流后的退款/终态
- 真实会话撤销（停用账号/强制退出后 AI 会话立即失效）

故障注入使用控制面直接创建的可撤销测试 Token/渠道完成，全部验收后已删除；期间临时启用的虚拟 Key 策略与回填策略已恢复为原状，API 已重启并健康。

## 验收口径

- 每个付费 request_id 只能有一个账本终态（预留/结算/退款）。
- 群聊一次运行共享 trace，各角色发言独立 request_id。
- 故障注入使用可撤销测试 Key 或获授权测试主体，验收后清理。
