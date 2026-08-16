# 能力注册表

能力注册表让工作流只依赖稳定能力 ID，模型/供应商选择收口到 adapter，替换 provider 不需要修改工作流。

## 注册表

`apps/ai-web/src/capabilities/registry.ts` 定义能力描述与校验：

- 能力 ID 唯一；
- scope 合法；
- 计费声明完整；
- 注册时拒绝重复 ID、未知 scope 与不完整计费声明。

当前注册的能力包括 `text.chat.general` 与 `group.scheduler` 等。

## Adapter 契约

`apps/ai-web/src/capabilities/adapters.ts`：

```ts
export type CapabilityAdapter = {
  resolveModel(capabilityId: string): string;
  resolveEmbeddingModel?(): string | null;
  resolveKnowledgeThreshold?(): number;
};
```

- `resolveModel`：注册表校验能力 ID，未知能力抛 `CapabilityRegistryError`；
- 默认模型来自 adapter 配置（环境变量兜底），不在工作流中读取；
- `createCapabilityAdapter({ model, embeddingModel })` 由 BFF 在调用时构造。

## 工作流侧规则

```text
workflow
  ↓ capability_id
  ↓ registry
  ↓ adapter
  ↓ provider
```

工作流禁止出现：

- provider 名称；
- 模型名称；
- 环境变量选择逻辑。

## 如何新增能力

1. 在 registry 登记唯一 ID、scope 与计费声明。
2. 在 `adapters.ts` 扩展解析逻辑或新增 adapter 工厂。
3. 工作流通过 `input.adapter` 调用，不新增模型字段。
4. 添加 registry 与 adapter 测试（未知能力失败、重复 ID 失败、替换 provider 不改 workflow）。

## 测试

`apps/ai-web/src/capabilities/registry.test.ts` 与 `apps/ai-web/src/capabilities/adapters.test.ts` 覆盖：

- 未知能力失败；
- 重复能力 ID 失败；
- 替换 provider 无需修改工作流；
- 知识阈值 env 覆盖。
