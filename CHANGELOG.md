# Changelog

本文件记录燕中 AI（ai_yanchuaner）对外可观察的版本变更。格式基于 Keep a Changelog，版本号遵循语义化版本。

## [v1.0.0] - 2026-08-17

v1.0 文档冻结与生产同步。架构已冻结，本版本只允许文档变更。

### Added

- Workflow Runtime：版本化 `chat/v1`、`roleplay/v1`、`group/v1` 工作流，支持超时、取消与生命周期事件。
- Capability Registry：能力 ID 注册、scope 与计费声明校验；workflow 不再持有 provider/model 名称。
- Repository Layer：会话、角色、世界、知识、记忆、偏好与 BYOK 的仓储端口与文件/内存适配器。
- Observability：事件脱敏、JSONL 导出、管理员查询入口与文件轮转。
- CI/CD：GitHub Actions 门禁（install、typecheck、test、ops integration、build、contracts verify、release check）。
- Production Reliability：数据卷备份恢复、磁盘治理、故障注入验收脚本。
- Billing 幂等：BFF 对同一 `client_request_id` 去重，避免重试重复扣费。

### Fixed

- 备份：`ai_web_data` 会话/角色/世界/知识/记忆/BYOK/观测数据纳入备份与恢复，并提供 Docker 集成测试。
- 幂等：同一 `client_request_id` 重复请求返回 409，网关只产生一次 reserve/settlement。
- 并发：JSON 仓储读改写加入 per-file 写锁，消除并发写丢失更新。
- 计费一致性：流中断与上游失败保持账本唯一终态（reserve/refund/settlement）。
