# 燕中 AI 文档索引

本文档树与 `main @ v1.0.0` 代码同步。文档事实来源优先级：当前代码 > 测试 > 部署配置 > 设计文档。

## 规范文档

| 文档 | 回答的问题 |
| --- | --- |
| [architecture.md](architecture.md) | AI 使用层的分层、模块职责与当前实现映射 |
| [workflow.md](workflow.md) | 工作流运行时、内置工作流与事件 |
| [gateway.md](gateway.md) | 如何只通过统一 API 网关使用模型与账本 |
| [capability.md](capability.md) | 能力注册表、能力 ID 与 adapter 契约 |
| [repository.md](repository.md) | 仓储端口、文件适配器、并发锁与迁移 |
| [observability.md](observability.md) | 事件脱敏、JSONL 导出、轮转与查询 |
| [billing.md](billing.md) | 账本链路、幂等与故障场景 |
| [deployment.md](deployment.md) | 生产部署、资源基线、备份恢复 |
| [operations.md](operations.md) | 健康检查、日志、request_id 排查与故障处理 |
| [security.md](security.md) | 信任边界、凭据与数据安全 |
| [changelog.md](changelog.md) | 版本变更索引（正文见根 `CHANGELOG.md`） |

## 依赖与来源

| 文档 | 回答的问题 |
| --- | --- |
| [dependency-baseline.md](dependency-baseline.md) | 依赖、镜像摘要与升级门禁 |
| [copyright-matrix.md](copyright-matrix.md) | 自主代码、参考、依赖与第三方归属 |

## CI 与运维入口

`.github/workflows/ci.yml` 在 pull request 与 main 推送时自动执行：`pnpm install --frozen-lockfile`、typecheck、test、`pnpm test:ops`、build、`contracts:verify` 与 `release:check`。任何一步失败都会让检查状态变为失败；把该 workflow 配置为 GitHub required check 仍是仓库设置待办（见 [operations.md](operations.md)）。

受控故障注入脚本 `scripts/acceptance/run-fault-injection.mjs` 支持五个场景：

```bash
node scripts/acceptance/run-fault-injection.mjs --scenario quota-failure
node scripts/acceptance/run-fault-injection.mjs --scenario rate-limit
node scripts/acceptance/run-fault-injection.mjs --scenario upstream-failure
node scripts/acceptance/run-fault-injection.mjs --scenario credential-revoke
node scripts/acceptance/run-fault-injection.mjs --scenario stream-abort
```

每个场景创建可撤销测试资源、执行请求、校验 HTTP 状态/错误码/账本，结束后自动清理，输出 machine-readable JSON report。

## 已知缺口（v1.0 文档冻结时如实登记）

以下问题不属于“已实现”能力，修复前不得在文档中描述为完成：

- 观测事件 schema 允许 `durationMs`/`outcome`，但运行时尚未真实生成（见 [observability.md](observability.md)）。
- `scripts/health-check.sh` 未包含 ai-web 服务（见 [operations.md](operations.md)）。
- 配置错误不会 fail-fast，容器会以 `/api/health=503` 保持运行（见 [operations.md](operations.md)）。
- 消息记录尚未补齐 `schemaVersion`，数据迁移未接入启动流程（见 [repository.md](repository.md)）。
- 消息 `request_id`/usage 与网关账本只有人工核对脚本，没有定时自动对账（见 [billing.md](billing.md)）。
- GitHub main 分支保护与 required check 尚未在仓库设置中启用（见 [operations.md](operations.md)）。
- 磁盘水位没有告警通道，只有清理脚本（见 [operations.md](operations.md)）。

## 历史与验收记录

以下文档记录特定阶段的设计或验收，不代表当前完整架构：

- `phase-0-gate.md`
- `phase-1-ai-web-bff.md`
- `phase-1-integration-acceptance.md`
- `phase-3-ai-web-identity-acceptance.md`
- `phase-3-openwebui-oidc-acceptance.md`
- `litellm-openwebui-poc.md`
- `staging-readiness.md`
- `yancore-subject-grant-client.md`
- `ai-61-real-gateway-acceptance.md`
- `yanzhong-ecosystem-vision.md`

## 维护规则

- 新文档只回答一个问题，并在本索引登记。
- 稳定规范与一次性验收记录分开。
- 路径、端点、环境变量和命令必须与代码核对。
- 新能力同步记录所有权、scope、计费类别、失败语义、观测和数据删除方式。
- 不复制根级状态或契约；生态治理仓发布后使用固定版本链接引用。
