# 工作流

工作流是 AI 使用层的执行单元：它决定一次交互“做什么、带哪些上下文、按什么步骤执行”，并发布可观测事件。工作流不直接选择供应商、不修改额度。

## 运行时

`apps/ai-web/src/domain/workflow-runtime.ts` 提供最小运行时：

- 按步骤顺序执行；
- 支持 `timeoutMs` 超时与外部 `AbortSignal` 取消；
- 自动发布 `run.*` 与 `step.*` 生命周期事件；
- 步骤失败时发布 `failed` 事件并向上抛出；
- 取消发布 `cancelled`，超时发布 `timeout` 错误码。

```ts
await runWorkflow({
  workflowId: "chat/v1",
  version: "1.0.0",
  runId: `run_${traceId}`,
  traceId,
  clientRequestId,
  signal,
  timeoutMs: 180_000,
  onEvent: emit,
  steps: [{ id: "chat.text.stream", run: async (context) => { /* ... */ } }],
});
```

## 内置工作流

| 工作流 | 文件 | 行为 |
| --- | --- | --- |
| `chat/v1` | `apps/ai-web/src/workflows/chat-v1.ts` | 普通聊天：单步骤调用文本能力并透传 SSE |
| `roleplay/v1` | `apps/ai-web/src/workflows/roleplay-v1.ts` | 角色扮演：角色/世界/历史/记忆/知识上下文贡献者 + 文本能力 |
| `group/v1` | `apps/ai-web/src/workflows/group-v1.ts` | 群聊：调度步骤选择 1–2 位成员，再分别流式发言 |

工作流输入携带 `capabilityId` 与 `adapter`，不携带模型名或供应商名。模型解析在 adapter 中完成（见 [capability.md](capability.md)）。

## 上下文贡献者

`apps/ai-web/src/workflows/context.ts` 定义贡献者接口：

- `personaSnapshotContributor`、`worldSnapshotContributor`、`historyContributor`；
- `memoryContributor`、`knowledgeContributor`、`systemPolicyContributor`；
- `assembleContext` 按 priority 组装并遵守预算。

知识检索失败按工作流策略产生 `degraded` 事件，不阻断对话；鉴权、策略与计费错误不得吞掉。

## 事件

事件类型与字段见 [observability.md](observability.md)。工作流只通过 `onEvent` 发布事件，由 BFF 汇入观测 hub。

## 如何新增工作流

1. 在 `apps/ai-web/src/workflows/` 新增 `xxx-v1.ts`，定义类型化 `Input`。
2. 用 `runWorkflow` 声明 `workflowId`、`version`、`timeoutMs` 与步骤。
3. 步骤内只通过 `input.adapter` 调用能力，不读环境变量选择模型。
4. 在 `chat-handler.ts` 的会话路由分支中调用，并保留 `traceId`/`clientRequestId` 传播。
5. 添加工作流级测试与 acceptance 测试。

## 禁止

- 工作流中出现 provider 名称、模型名称或环境变量选择逻辑；
- 工作流直接修改用户额度或写入网关内部表；
- 失败时绕过网关直连供应商；
- 新增页面条件分支复制已有工作流语义。
