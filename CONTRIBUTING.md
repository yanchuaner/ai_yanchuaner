# 贡献指南

## 开始前

先阅读 `README.md`、`docs/api-platform-integration.md`、`docs/copyright-matrix.md`、`LICENSE` 与 `THIRD_PARTY_NOTICES.md`。从最新 `main` 创建功能分支，提交只包含一个明确问题，不提交 `.env`、凭据、数据库、备份、用户内容或本机配置。

## 来源与版权

- 新功能优先放入燕中自主模块或独立进程，不复制 LiteLLM、Open WebUI 或其他上游的具体实现。
- 修改第三方配置不改变第三方代码的版权；不得删除其 LICENSE、NOTICE、品牌条件和版权头。
- 变量改名、格式化或 AI 改写不构成自主实现证据。自主替换应先有需求、接口、数据模型、测试与迁移设计。
- 普通贡献不会自动把版权转让给组织。在运营主体和贡献协议确认前，贡献者保留其实际创作部分的权利。
- 使用 AI 辅助时，贡献者仍需核对来源、许可证、正确性和安全性，并在 PR 中如实说明。

## 验证

至少执行：

```powershell
docker compose config --quiet
git diff --check
```

涉及运行行为时，再执行 `scripts/check-environment.ps1`、相关冒烟测试和备份/恢复检查。PR 应列出实际运行的命令、未运行项目、数据迁移与回滚方式，并同步更新版权矩阵和第三方摘要。
