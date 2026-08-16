# 燕中 AI 项目约定

本仓库实现燕中生态 AI 使用层。开始工作前先读 `../AGENTS.md`、`../docs/architecture.md`、`../docs/contracts.md`，再读本仓 `todo.md`、`docs/README.md` 与 `docs/architecture.md`。

## 定位

- `apps/ai-web` 是 `ai.yanchuaner.cn` 的自主公网产品入口。
- 本仓拥有会话、角色、世界、知识、记忆、工作流定义、用户偏好和 BYOK 媒体设置。
- 主站拥有身份；`api_yanchuaner` 拥有模型目录、Key、策略、额度、结算与审计。本仓不得复制这些真值。
- Open WebUI 是内网过渡客户端；LiteLLM 是可替换设施依赖，二者都不是燕中 AI 的产品核心或领域契约。

## 架构方向

```text
Web / future IM adapter
          ↓
message envelope + session router
          ↓
versioned workflow runtime
          ↓
context contributors + capability registry
          ↓
YanCore gateway port → api.yanchuaner.cn
          ↓
repository / credential / observability ports
```

Kirara AI 只提供使用层分层参考。新增代码使用燕中自己的 TypeScript 类型、命名和测试，不复制其 Python 实现、插件、界面或品牌资产。

## 当前迁移边界

- `src/app/page.tsx` 当前集中大量页面状态和业务动作，不再向其中直接增加新的网络协议或领域规则。修改相关功能时，优先提取类型化 API client、领域 action 或独立状态边界。
- `src/lib/chat-handler.ts` 当前集中鉴权、RAG、记忆、群聊调度与模型转发，不再作为新能力的永久入口。新增上下文来源或工具前，先抽取可测试的上下文贡献者、工作流步骤或能力端口。
- `/data` 文件存储是当前仓储适配器，不是公共数据契约。新实体带 schema 版本，领域服务不得依赖文件名和目录布局。
- `chat`、`roleplay`、`group` 是首批内置工作流。行为变化必须保持版本与旧会话兼容，不通过页面条件分支复制流程。

## 执行清单

- `todo.md` 是本仓当前开发队列。默认从首个未完成且无阻塞的事项开始，不跳过契约、测试或迁移前置直接开发后续功能。
- 一个编号对应一个可独立评审的主题。开始前核对现有未提交改动，避免把其他人的工作混入该事项。
- 实现与清单假设不一致时，先按实际代码修正事项、依赖和完成定义；涉及生态契约或数据所有权时先修改治理仓规范并完成对应评审。
- 只有事项列出的自动门禁和必要真实链路验收均通过后才能勾选。仅有类型检查、构建通过或页面可见不代表工作流、计费和故障路径完成。
- 完成一个阶段后更新根级阶段真值并精简已完成细节；历史证据进入阶段验收文档，不在 `todo.md` 无限累积。

## 模块职责

| 模块 | 职责 | 禁止承担 |
| --- | --- | --- |
| 接入适配器 | Web/IM 消息与统一信封互转 | 角色提示、余额、供应商路由 |
| 会话路由 | 主体、会话、模式、取消与工作流选择 | 直接调用供应商 |
| 工作流运行时 | 有界执行步骤、超时、重试和事件 | 绕过 scope、网关或审计 |
| 上下文服务 | 角色、世界、历史、知识与记忆预算 | 修改额度、保存供应商 Key |
| 能力注册表 | 对话、嵌入、搜索、画图、ASR/TTS 等能力描述 | 把动态代码默认为可信 |
| YanCore 网关端口 | 主体交换、能力调用、流水/Key 查询 | 推算并写用户余额 |
| 仓储端口 | 会话、角色、世界、知识、记忆和偏好 | 暴露存储实现给 UI |
| 凭据端口 | 用户 BYOK 加密、读取、撤销 | 复用主站或网关 Secret |
| 观测端口 | trace、request、工作流与降级事件 | 记录正文和明文凭据 |

## 实现规则

- Route Handler 只做 HTTP/SSE 适配、会话入口、schema 校验和错误映射。
- React 组件只呈现状态和触发动作，不拼接跨系统凭据或供应商请求。
- 外部响应在 adapter/client 边界转为领域类型；UI 不依赖 New API、LiteLLM 或供应商字段。
- 所有由生态承担成本的模型与嵌入请求经过 `api.yanchuaner.cn`，保留网关 `request_id`。
- 用户自配媒体服务必须明确标为 BYOK，凭据加密、按用户隔离、可删除，不计入公益余额。
- 知识检索失败可按工作流策略降级，但必须返回可观测的降级状态；鉴权、策略和计费错误不得吞掉。
- 群聊并行拉流可由浏览器承担；服务器不合并流或做无必要媒体转码。
- 插件 Preview 期只允许内置或构建期注册。未完成 manifest、scope、资源和隔离模型前，不加载公网插件包。

## 数据与安全

- 会话、角色、世界、知识、记忆和设置按主站 `sub` 映射后的内部主体隔离。
- 浏览器不得读取主站 access token、YanCore grant、应用 Key、OIDC Secret 或交换 Secret。
- 加密 Cookie 使用 `HttpOnly`、`SameSite=Lax`，HTTPS 强制 `Secure`；撤销或上游 401/403 时立即清除。
- 日志不记录完整消息、知识片段、上传内容、Authorization、Cookie、Key、grant 或第三方错误体。
- 不在公网暴露 Open WebUI、LiteLLM、数据库或内部管理接口。

## 品牌与来源

- 公网界面只使用燕中 AI 的名称、Logo、视觉、默认内容和帮助入口。
- 第三方归属放在开源与法律页面，不把上游 Logo 用作燕中产品标识。
- 新增依赖或借鉴实现时更新 `THIRD_PARTY_NOTICES.md` 与 `docs/copyright-matrix.md`。
- 本仓自主内容采用 AGPL-3.0；直接采用第三方材料时保留其原许可和归属。

## 常用命令

```bash
pnpm install --frozen-lockfile
pnpm typecheck:ai-web
pnpm test:ai-web
pnpm build:ai-web
```

群聊、工作流、SSE、语音或媒体变更还需通过本地 fixture 或受控真实接口冒烟。纯文档改动执行 `git diff --check` 和链接/术语检查。

## 发布

- 使用 `feat/`、`fix/`、`docs/`、`refactor/`、`chore/`、`test/` 或 `ci/` 分支。
- 在 WSL 构建 `ai-yanchuaner/ai-web:preview`，保留“日期-短哈希”追溯标签；生产服务器不构建。
- 发布只影响 `ai.yanchuaner.cn` 和本仓数据，不触碰主站数据库、`.env` 或服务。
- 数据格式变化先备份并验证迁移/回滚；部署后检查健康、OIDC、核心工作流、request ID 和结算展示。
- 发布执行 `pnpm release:check`；生产依赖审计存在未处置 high/critical 公告时阻断新发布，风险接受必须按工作区安全规则登记 owner、可达性、缓解和到期日。

## 文档入口

- 当前执行顺序与完成定义：`todo.md`
- 架构与迁移边界：`docs/architecture.md`
- API 网关集成：`docs/api-platform-integration.md`
- 部署与恢复：`docs/deployment.md`
- 来源矩阵：`docs/copyright-matrix.md`
- 阶段与验收历史：`docs/phase-*.md`、`docs/litellm-openwebui-poc.md`

阶段历史只作为证据；当前状态以 `../docs/燕中生态项目关系.txt` 为准。
