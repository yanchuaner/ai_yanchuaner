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

`contracts/manifest.json` 固定 AI 当前消费的六类生态 Schema 及其共享定义，来源为治理仓的不可变提交。使用 `pnpm contracts:verify` 可离线校验提交摘要、路径边界和 JSON Schema；只有在 manifest 已记录不可变提交与 SHA-256 时才可运行 `pnpm contracts:sync` 从该提交同步。当前仅固定 Schema 快照，运行时代码尚未接入这些 Schema。

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
