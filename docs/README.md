# 燕中 AI 文档

## 当前规范

| 文档 | 回答的问题 |
| --- | --- |
| [architecture.md](architecture.md) | AI 使用层如何分层、现有实现如何迁移 |
| [api-platform-integration.md](api-platform-integration.md) | AI 如何只通过统一 API 网关使用模型与账本 |
| [deployment.md](deployment.md) | 如何部署、备份、恢复和检查运行环境 |
| [yancore-subject-grant-client.md](yancore-subject-grant-client.md) | AI BFF 如何消费 YanCore 主体授权 |
| [dependency-baseline.md](dependency-baseline.md) | 依赖、镜像与升级门禁 |
| [copyright-matrix.md](copyright-matrix.md) | 自主代码、参考、依赖与第三方归属 |

## 生态契约快照

`contracts/manifest.json` 固定 AI 当前消费的七类生态 Schema 及其共享定义，来源为治理仓的不可变提交。使用 `pnpm contracts:verify` 可离线校验提交摘要、路径边界和 JSON Schema；只有在 manifest 已记录不可变提交与 SHA-256 时才可运行 `pnpm contracts:sync` 从该提交同步。工作流事件与消息信封已部分接入运行时，完整 Schema 校验仍以 Web adapter 与事件边界为准。

## CI 门禁

`.github/workflows/ci.yml` 在 pull request 与 main 推送时自动执行：`pnpm install --frozen-lockfile`、typecheck、test、build、`contracts:verify` 与 `release:check`。任何一步失败都会让检查状态变为失败；main 分支的强制保护应在 GitHub 仓库设置中把该 workflow 配置为 required check。

## 故障注入验收脚本

`scripts/acceptance/run-fault-injection.mjs` 固化 AI-61 的受控故障注入：

```bash
node scripts/acceptance/run-fault-injection.mjs --scenario quota-failure
node scripts/acceptance/run-fault-injection.mjs --scenario rate-limit
node scripts/acceptance/run-fault-injection.mjs --scenario upstream-failure
node scripts/acceptance/run-fault-injection.mjs --scenario credential-revoke
node scripts/acceptance/run-fault-injection.mjs --scenario stream-abort
```

每个场景都会创建可撤销测试资源、执行请求、校验 HTTP 状态/错误码/账本，并在结束后自动清理；输出 machine-readable JSON report。

## 观测事件落盘

生产通过 `AI_WEB_OBSERVABILITY_FILE` 指定 JSONL 观测文件（默认 `/data/observability/events.jsonl`）。事件先经 `sanitize` 再落盘，仅保存 schema/event/run/step/capability/trace/request/conversation/duration/outcome/error 等字段；消息正文、token、api key、cookie、grant 不会写入。管理员可用 `GET /api/admin/observability/events?requestId=...` 查询。

文件按 `AI_WEB_OBSERVABILITY_MAX_BYTES`（默认 50 MiB）轮转，保留 `AI_WEB_OBSERVABILITY_KEEP_ROTATED`（默认 5）个历史文件；查询会跨当前与历史文件检索，单行损坏不中断查询。

## 运维脚本

- `pnpm test:ops`：Docker 集成测试，验证 ai-web 数据卷归档 create/restore 闭环（无 Docker 环境自动跳过）。
- `bash scripts/disk-governance.sh [--dry-run]`：清理悬空镜像/构建缓存并保留最新 5 个 ai-web 日期镜像。

生态级身份、网关、工作流、计费和观测语义由工作区根 `docs/architecture.md`、`docs/contracts.md`、`docs/extensions.md`、`docs/billing-and-ledger.md` 与 `docs/observability.md` 定义。本目录只补充 AI 仓库实现。生态治理仓尚未公开前不维护越出本仓根目录的 Markdown 链接；发布后改为固定版本链接。

## 历史与验收记录

以下文档记录特定阶段的设计或验收，不代表当前完整架构：

- `phase-0-gate.md`
- `phase-1-ai-web-bff.md`
- `phase-1-integration-acceptance.md`
- `phase-3-ai-web-identity-acceptance.md`
- `phase-3-openwebui-oidc-acceptance.md`
- `litellm-openwebui-poc.md`
- `staging-readiness.md`

历史记录中的“当前限制”“下一步”和部署角色按文档日期理解；当前阶段只以根级 `燕中生态项目关系.txt` 为准。

## 产品与领域设计

AI 产品蓝图、RAG 与故事世界的跨仓设计位于工作区根 `docs/`。实现时先遵守本仓架构，再引用这些产品文档，避免把页面流程直接写成跨系统协议。

## 维护规则

- 新文档只回答一个问题，并在本索引登记。
- 稳定规范与一次性验收记录分开。
- 路径、端点、环境变量和命令必须与代码核对。
- 新能力同步记录所有权、scope、计费类别、失败语义、观测和数据删除方式。
- 不复制根级状态或契约；治理仓发布后使用固定版本链接引用。
