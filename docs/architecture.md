# 燕中 AI 使用层架构

本文定义 `ai_yanchuaner` 的目标模块、当前实现映射和渐进迁移方式。生态级边界见 `../../docs/architecture.md`，跨系统语义见 `../../docs/contracts.md`。

> 状态：v1.0 文档冻结。当前实现以本文件“当前实现映射”与测试为准；历史阶段文档不代表现状。

## 职责

燕中 AI 把身份、角色、世界、知识、记忆和工具组织成用户可操作的 AI 体验。它决定“这次交互要做什么、带哪些上下文、按什么步骤执行”，不决定“使用哪个内部供应商渠道、扣多少余额”。

本仓权威数据：

- 会话与消息；
- 角色卡及来源；
- 故事世界与会话快照；
- 用户资料、角色资料和向量索引；
- 长期记忆；
- 工作流定义与用户偏好；
- 用户明确配置的 BYOK 媒体凭据。

本仓只读消费：主站主体、YanCore grant、网关能力目录、余额、流水和 request ID。

## 目标模块

```text
apps/ai-web
  transport/web          HTTP、SSE、OIDC 与浏览器消息适配
  application            用例、会话路由、命令和查询
  domain                 消息、会话、角色、世界、知识、记忆、工作流
  workflows              版本化内置工作流与运行时
  capabilities           能力 manifest、注册表和端口
  adapters
    yancore              主体与统一 API 网关客户端
    storage              文件/数据库仓储实现
    credentials          BYOK 加密存储
    observability        日志、指标和追踪导出
  ui                     页面、组件、状态投影和交互
```

该结构表示依赖方向，不要求一次性搬迁目录。只有抽出真实边界并有测试时才创建模块。

## 统一消息模型

接入适配器把平台输入转换为消息信封：

```ts
type MessageEnvelope = {
  schemaVersion: "1.0";
  messageId: string;
  conversationId: string;
  sender: { kind: "user" | "persona" | "system"; id: string };
  parts: MessagePart[];
  metadata: { adapter: string; replyTo?: string };
  createdAt: string;
};
```

`MessagePart` 首批包含文本、图片引用、音频引用、工具调用、工具结果和错误。领域层不持有 Web `File`、Taro 对象、供应商 response 或 SSE 原始行。

## 请求流程

```text
Web adapter
  → authenticate subject
  → session router
  → select workflow version
  → build execution context
  → run typed steps
       ├─ context contributors: persona/world/history/knowledge/memory
       ├─ capability: gateway chat/embedding
       └─ capability: explicit BYOK media
  → emit domain events
  → Web adapter maps events to SSE/UI
```

工作流的一次付费能力调用获得网关 `request_id`；同一用户操作的多个调用共享 `trace_id`。浏览器断开由运行时传播取消信号，但结算终态由网关决定。

## 内置工作流

| 工作流 | 当前行为 | 迁移目标 |
| --- | --- | --- |
| `chat/v1` | 普通消息直接调用模型 | 显式的历史、用户资料与模型步骤 |
| `roleplay/v1` | 注入角色、知识与长期记忆 | 上下文贡献者按预算组合并返回引用 |
| `group/v1` | 调度器选 1–2 位角色，再分别流式发言 | 调度与角色发言成为可观测步骤，共享 trace |

工作流发布后不原地改变历史语义。旧会话记录使用的工作流版本，升级时通过显式迁移或兼容执行。

长期记忆刷新（`memory-handler.ts`）不是独立工作流：它由消息路由在满阈值后触发，使用网关对话能力生成摘要并写入记忆仓储。

## 能力注册表

能力由 manifest 描述，不由 UI 按钮或环境变量隐式定义：

| 能力 | 默认执行者 | 计费域 | 失败策略 |
| --- | --- | --- | --- |
| 文本对话 | YanCore gateway adapter | API 公益/权益账本 | 不降级到直连 |
| 向量嵌入 | YanCore gateway adapter | API 公益/权益账本 | RAG 可标记降级 |
| 视觉理解 | BYOK media adapter（当前） | 用户第三方账户 | 明确失败，不扣公益余额 |
| 图片生成 | BYOK media adapter（当前） | 用户第三方账户 | 明确失败，不扣公益余额 |
| ASR/TTS | BYOK voice adapter（当前） | 用户第三方账户 | 文本聊天继续可用 |
| 知识/记忆 | 本仓领域服务 | 无独立模型费或通过网关调用 | 按工作流规则降级/重试 |

未来将视觉、图片或语音纳入公益能力前，必须先由 API 网关支持其持久化计费状态机。

## 上下文组装

每个贡献者返回结构化片段和元数据：

```ts
type ContextContribution = {
  source: "persona" | "world" | "history" | "knowledge" | "memory";
  priority: number;
  content: string;
  estimatedTokens: number;
  references?: { id: string; label: string }[];
};
```

组装器负责总预算、排序、裁剪和冲突规则。贡献者不直接修改最终提示数组，也不吞掉鉴权和网关错误。知识失败可以产生 `context.degraded` 事件，用户界面可显示本轮未使用资料。

## 存储

当前 `/data` JSON 文件实现满足单实例 Preview，但必须作为仓储适配器管理：

- 实体带 `schemaVersion`、稳定 ID、owner 和时间戳；
- 仓储接口执行 owner 条件，不由路由加载后再判断；
- 写入保持原子替换（临时文件 + rename）和进程内 per-file 并发锁（`withFileLock`）；
- 数据迁移有备份、dry-run、校验和与回滚；
- 向量索引视为可重建派生数据；
- 数据库适配器启用前使用同一仓储契约运行测试。

多实例、跨实体事务或数据规模超过文件模式边界时，迁移到数据库；不通过共享卷并发写继续扩容。

已知限制：消息记录尚未补齐 `schemaVersion`，迁移脚本未接入启动流程；文件模式不支持多实例共享写。

## YanCore 网关端口

领域层依赖稳定端口，而不是直接散布 `fetch`：

- `exchangeSubject`：主站短期令牌换应用主体和会话凭据；
- `getCapabilities`：读取能力目录与限制；
- `invokeChat` / `invokeEmbedding`：流式或非流式能力调用；
- `getBalance` / `listLedger`：只读账本投影；
- `listKeys` / `createKey` / `revokeKey`：个人开发者 Key；
- `grantQuota`：管理员线下额度操作。

adapter 负责旧/新响应兼容、错误码归一、request ID 和会话撤销；页面不直接解释上游错误文本。

## 可观测性

事件由工作流运行时发布：

- `workflow.started/completed/failed/cancelled`；
- `workflow.step.started/completed/failed/degraded`；
- `context.built/degraded`；
- `gateway.request.started/completed/failed`；
- `session.revoked`；
- `repository.migration.completed/failed`。

字段白名单包含 workflow/version、conversation、trace、request、step、duration、outcome 和错误码，不包含完整提示词、知识正文、Key 或 Cookie。**当前运行时只真实生成 errorCode（失败/取消事件）；durationMs 与 outcome 尚在 schema 白名单中但未由运行时产出**，属于已登记缺口，见 [observability.md](observability.md)。

## 当前实现映射

| 当前文件 | 当前职责 | 迁移方向 |
| --- | --- | --- |
| `apps/ai-web/src/hooks/*`、`apps/ai-web/src/lib/*-actions.ts` | 页面动作与类型化 API client | 保持；不再向 `page.tsx` 增加网络协议 |
| `apps/ai-web/src/lib/chat-handler.ts` | BFF 对话入口：鉴权、路由、幂等、工作流调用 | 保持为薄编排；能力解析在 adapter |
| `apps/ai-web/src/workflows/chat-v1.ts`、`roleplay-v1.ts`、`group-v1.ts` | 版本化内置工作流 | 已落地；新增能力不复制旧流程 |
| `apps/ai-web/src/capabilities/registry.ts`、`adapters.ts` | 能力注册表与 provider/model 解析 | 已落地；工作流不再持有模型名 |
| `apps/ai-web/src/lib/*-repository.ts`、`*-file-repository.ts` | 仓储端口与文件/内存适配器 | 已落地；写入带锁与原子替换 |
| `apps/ai-web/src/lib/yancore-gateway.ts`、`chat.ts`、`embedding.ts` | 网关客户端与请求映射 | 已落地；页面不直接解析上游字段 |
| `apps/ai-web/src/lib/media.ts`、`voice.ts`、`byok-settings-*` | BYOK 协议转发与加密凭据 | 已落地 |
| `apps/ai-web/src/observability/*` | 事件脱敏、JSONL 导出与查询 | 已落地；duration/outcome 为登记缺口 |
| Route Handlers | HTTP/SSE 适配与错误映射 | 保持薄 transport |

## 已完成边界（相对历史阶段）

- 会话、角色、世界、知识、记忆与偏好均有仓储端口与文件适配器。
- 工作流、能力注册表、网关客户端与观测闭环已接入运行时。
- 写入并发保护（per-file 锁）与原子替换已实现并有测试。
- 备份/恢复覆盖 `ai_web_data` 卷；故障注入脚本覆盖五个生产场景。

## 仍待办（v1.0 冻结时如实登记）

- 观测事件 `durationMs`/`outcome` 真实产出。
- `health-check.sh` 纳入 ai-web；配置错误 fail-fast。
- 消息 `schemaVersion` 补齐与迁移自动化。
- 消息与网关账本自动对账。
- GitHub required check 与磁盘告警（仓库/运维设置）。

## 禁止的捷径

- 在 UI 中根据供应商名决定业务行为；
- 从 AI 服务读取 API 或主站数据库；
- 工作流直接修改用户额度；
- 失败时绕过网关直连供应商；
- 插件读取宿主全部环境变量或任意文件；
- 为未来插件预建无消费者的通用框架；
- 将文件布局、LiteLLM 配置或 Open WebUI 数据结构发布为燕中契约。
