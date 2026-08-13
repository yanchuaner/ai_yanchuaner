# 燕中 AI 仓库约定

工作区级约定见同级 `../AGENTS.md` 与 `../docs/`。本仓库自主代码采用 AGPL-3.0。

## 定位

- 自主 `apps/ai-web` 是公网产品入口；Open WebUI 与 LiteLLM 只作为内网过渡组件。
- 身份与账本由主站和 `api_yanchuaner` 负责，本仓库不复制额度、流水或用户表。
- 服务器只做平台：鉴权、额度、人设/记忆/知识注入与模型转发；多角色群聊并发拉流、媒体录音/播放由用户浏览器承担，本仓库不做服务器端流合并或媒体转码。

## 常用命令

```bash
pnpm test:ai-web
pnpm typecheck:ai-web
pnpm build:ai-web
```

## 发布流程

- 修改后跑 `typecheck`、`test`、`build` 三项门禁，群聊/语音改动还要用本地 fixture 或真实接口冒烟。
- 分支统一使用 `feat/`、`fix/`、`docs/`、`refactor/`、`chore/`，先 PR 合并再发布。
- 在 WSL 构建 `ai-yanchuaner/ai-web:preview`，同时保留“日期-短哈希”追溯标签；导出镜像上传服务器离线导入，生产服务器不做构建。
- 部署只影响 `ai.yanchuaner.cn`，不触碰主站数据库、`.env` 与服务。

## 红线

- 不在公网暴露 Open WebUI、LiteLLM 管理端或数据库端口。
- 会话数据只写入 `ai_web_data` 卷，不保存主站 token、grant 或应用 Key 明文。
- 真实密钥只进入 `.env` 或凭据库，不进入仓库、日志和截图。
- 用户自配语音凭据加密落盘，只用于对应媒体请求，不回写模型账本。
