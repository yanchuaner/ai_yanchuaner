# 燕中 AI 贡献规则

## 开始前

先阅读 `AGENTS.md`、`docs/README.md`、`docs/architecture.md`、`docs/gateway.md`、`docs/copyright-matrix.md`、`LICENSE` 与 `THIRD_PARTY_NOTICES.md`。跨仓变更同时阅读工作区 `docs/contracts.md` 和 `docs/燕中生态项目关系.txt`。

从最新 `main` 创建符合工作区命名规则的分支。一个 Pull Request 只处理一个可评审问题，不提交 `.env`、凭据、数据库、备份、用户会话、知识原文、上传内容、构建产物或本机配置。

## 架构边界

- 会话、角色、世界、知识、记忆和工作流属于 AI 使用层；身份、模型策略、Key、额度和账本不在本仓重建。
- 所有由生态承担费用的模型和嵌入调用进入 `api.yanchuaner.cn`，并保留网关 `request_id`。
- 页面和路由只组合用例与协议适配；外部响应在 client/adapter 边界转换为燕中领域类型。
- 新接入、能力、工作流、存储或观测实现进入明确端口，不把供应商字段、文件结构或环境变量发布为领域契约。
- 外部插件执行在 manifest、权限、隔离、资源、审计、停用和卸载门禁完成前保持关闭。

## 来源与版权

- 新功能优先在燕中自主模块中实现，不复制 LiteLLM、Open WebUI、Kirara AI 或其他上游的具体实现、界面和品牌资产。
- 修改第三方配置不改变第三方代码的版权；保留 LICENSE、NOTICE、版权头、品牌条件和源码链接。
- 改名、格式化、翻译或自动改写不构成自主实现证据。自主替换需要独立需求、接口、数据模型、测试和迁移记录。
- 贡献者保留其实际创作部分版权，并按仓库 AGPL-3.0-only 条件提供贡献；书面协议另有约定时除外。
- 使用自动化辅助工具不改变提交者对来源、正确性、隐私、安全和验证结果的责任。

## Pull Request

说明应包含：用户可观察的变化与明确非目标；受影响领域、API、schema 和消费者；数据迁移、兼容与回滚；身份、隐私、计费、日志和品牌影响；实际运行的命令、结果和未覆盖范围；第三方来源、许可证和镜像摘要。

涉及跨仓契约时，先让提供方兼容发布，再迁移消费者；没有观测证明旧消费者退出前，不删除旧版本。

## 验证

最低门禁：

```bash
pnpm install --frozen-lockfile
pnpm typecheck:ai-web
pnpm test:ai-web
pnpm build:ai-web
docker compose config --quiet
git diff --check
```

群聊、SSE、工作流、RAG、记忆、语音或媒体变更还要使用固定 fixture 覆盖成功、取消、断流、超时、限流和上游错误。涉及迁移或存储时，在可销毁数据上验证升级、回滚、备份和恢复。不得用真实成员数据或生产凭据运行测试。
