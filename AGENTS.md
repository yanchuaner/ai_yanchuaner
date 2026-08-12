# 燕中 AI 仓库约定

工作区级约定见同级 `../AGENTS.md` 与 `../docs/`。本仓库自主代码采用 AGPL-3.0。

## 定位

- 自主 `apps/ai-web` 是公网产品入口；Open WebUI 与 LiteLLM 只作为内网过渡组件。
- 身份与账本由主站和 `api_yanchuaner` 负责，本仓库不复制额度、流水或用户表。

## 常用命令

```bash
pnpm test:ai-web
pnpm typecheck:ai-web
pnpm build:ai-web
```

## 红线

- 不在公网暴露 Open WebUI、LiteLLM 管理端或数据库端口。
- 会话数据只写入 `ai_web_data` 卷，不保存主站 token、grant 或应用 Key 明文。
- 真实密钥只进入 `.env` 或凭据库，不进入仓库、日志和截图。
- 分支统一使用 `feat/`、`fix/`、`docs/`、`refactor/`、`chore/`。
