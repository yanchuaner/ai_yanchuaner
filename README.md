# 燕中 AI

燕中 AI 是认证成员使用的 AI 工作台，也是燕中生态的 AI 使用层。它负责会话、角色、世界、知识、记忆、群聊、媒体和工作流体验；身份来自主站，模型能力、策略、额度与账本来自燕中统一 API 网关。

- 公开入口：`https://ai.yanchuaner.cn`
- 当前状态：自主 AI Web 已进入 Preview 运行，使用层模块化仍在进行
- 许可：自主代码与文档采用 AGPL-3.0，第三方组件保持原许可

生态当前完成度只在工作区 `../docs/燕中生态项目关系.txt` 维护。

## 系统边界

```text
yanchuaner.cn OIDC
        |
        v
apps/ai-web: session, persona, world, knowledge, memory, workflow
        |
        v
api.yanchuaner.cn: credential, policy, capability, routing, ledger
        |
        v
provider and infrastructure adapters
```

- 不维护公开注册、成员角色或第二套身份表。
- 不决定供应商渠道，不保存平台模型密钥，不计算或修改用户余额。
- 浏览器不接触 YanCore grant、下游应用 Key 或供应商凭据。
- Open WebUI 是内网过渡客户端，LiteLLM 是可替换设施适配器；二者不定义燕中产品契约。
- 用户自配媒体服务凭据与主站会话、YanCore 凭据和公益账本严格隔离。

详细职责、消息、工作流、仓储和迁移边界见 [架构文档](docs/architecture.md) 与 [网关集成](docs/api-platform-integration.md)。

## 当前产品能力

当前 Preview 包含：

- 主站 OIDC 登录、加密 HttpOnly 会话、YanCore 主体交换和短期应用 Key；
- 普通助手、角色扮演和 2 至 4 位角色的群聊；
- 私有角色库、chara_card_v3 导入导出、收藏和会话管理；
- 私有世界库、世界快照、用户角色和群聊世界注入；
- 用户级与角色级知识检索、角色长期记忆及清理入口；
- 用户自配的图片理解、图片生成、ASR 和 TTS 兼容服务。

当前关键缺口是：已发布的消息与工作流 schema 尚未接入运行时契约测试、页面与处理器拆分、正式仓储端口、完整 trace，以及网关真实失败退款和对账。未完成能力和验收层级见工作区阶段状态文档，不能从页面存在推断为生产闭环。

## 仓库结构

```text
apps/ai-web/          自主 Next.js 工作台、OIDC、BFF 与领域实现
gateway/              LiteLLM 设施配置，不是业务契约
deploy/               Nginx 等部署配置
docs/                 架构、集成、部署、来源与历史验收
scripts/              本地验证、备份、加固和发布检查
docker-compose.yml    自主 Web 与过渡设施的本地编排
```

当前 `/data` 文件实现属于 Repository Adapter。页面和工作流不得继续直接依赖 JSON 布局；迁移方向见 [架构文档](docs/architecture.md)。

## 本地开发

要求 Node.js 20+ 与仓库声明的 pnpm 版本。先从 `.env.example` 创建不提交的本地 `.env`，使用开发专用的假值或可撤销凭据。

```bash
pnpm install --frozen-lockfile
pnpm typecheck:ai-web
pnpm test:ai-web
pnpm build:ai-web
pnpm dev:ai-web
```

直接运行时，应用默认监听 `http://localhost:3001`。OIDC、YanCore 和模型对话需要同时运行主站与 API，并配置精确的本地回调和独立客户端凭据。

使用 Compose 验证自主 Web：

```bash
docker compose --profile yancore up -d --build ai-web
docker compose ps
```

Compose 默认将自主 Web 映射到 `127.0.0.1:3002`。LiteLLM、PostgreSQL 和 Open WebUI 属于设施或历史兼容链路；只有相关运维任务才启动，详细步骤见 [部署文档](docs/deployment.md) 和带日期的 PoC/验收记录。

停止验证环境时使用 `docker compose down`。删除数据卷会清除会话、设施配置和测试数据，只能在确认目标为可销毁环境后执行。

## 配置与秘密

- `.env.example` 只描述变量，不存真实值；`.env`、备份、数据库、卷导出和日志不得提交。
- OIDC 客户端、Subject Exchange 客户端、Open WebUI 客户端和设施管理员使用不同凭据。
- `AI_WEB_SESSION_SECRET`、OAuth Secret、供应商 Key 和用户媒体凭据不得输出到浏览器、普通日志或测试快照。
- 自定义服务地址经过允许协议、域名/IP、重定向和 DNS 重绑定检查，阻断内网与云元数据访问。
- 数据卷按敏感用户内容备份、恢复和销毁；生产与开发数据不互换。

## 验证

普通代码改动至少运行：

```bash
pnpm release:check
```

该命令执行类型检查、测试、生产构建和生产依赖审计。身份改动增加真实 OIDC/PKCE 合同检查；聊天和工作流改动覆盖 SSE、取消、限流、额度不足和网关故障；知识、记忆、角色和世界改动覆盖 owner 隔离、旧 schema、删除与迁移；部署改动运行健康、备份与恢复检查。

## 文档

- [文档索引](docs/README.md)
- [使用层架构](docs/architecture.md)
- [统一网关集成](docs/api-platform-integration.md)
- [部署与恢复](docs/deployment.md)
- [依赖基线](docs/dependency-baseline.md)
- [版权与来源矩阵](docs/copyright-matrix.md)
- [第三方声明](THIRD_PARTY_NOTICES.md)
- [安全策略](SECURITY.md)

`docs/phase-*`、`litellm-openwebui-poc.md` 和 staging 记录是特定日期的历史证据，不覆盖当前架构与状态。

## 来源与许可

本仓自主代码与文档按 [GNU Affero General Public License v3.0](LICENSE) 发布，远程服务需要提供对应源码入口。Kirara AI 只作为使用层架构参考；直接采用任何第三方代码或材料时单独登记来源并履行其许可证。

LiteLLM、Open WebUI、Next.js、React、openid-client、Lucide 等第三方软件保持各自许可证、版权与品牌要求。完整边界见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [版权与来源矩阵](docs/copyright-matrix.md)。
