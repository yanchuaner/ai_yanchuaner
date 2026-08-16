# 仓储层

所有领域数据访问必须经过 服务 → 仓储端口 → 适配器，禁止 service/router 直接访问 `fs` 或 JSON 布局。

## 端口与适配器

| 数据 | 端口 | 文件适配器 | 内存适配器 |
| --- | --- | --- | --- |
| 会话 | `conversation-repository.ts` | `conversation-file-repository.ts` | `conversation-memory-repository.ts` |
| 角色 | `persona-repository.ts` | `persona-file-repository.ts` | `persona-memory-repository.ts` |
| 世界 | `world-repository.ts` | `world-file-repository.ts` | `world-memory-repository.ts` |
| 知识 | `knowledge-repository.ts` | `knowledge-file-repository.ts` | `knowledge-memory-repository.ts` |
| 记忆 | `memory-repository.ts` | `memory-file-repository.ts` | `memory-memory-repository.ts` |
| 偏好 | `preferences-repository.ts` | `preferences-file-repository.ts` | `preferences-memory-repository.ts` |
| BYOK | `byok-settings-repository.ts` | `byok-settings-file-repository.ts` | `byok-settings-memory-repository.ts` |

## 写入一致性

`apps/ai-web/src/lib/store.ts` 提供：

- `writeJsonFile`：临时文件 + rename 原子替换，文件权限 `0600`；
- `withFileLock(file, run)`：进程内 per-file 串行化，修复并发读改写丢失更新；
- `readJsonFile`：ENOENT 返回 fallback，损坏内容抛错。

并发测试位于 `apps/ai-web/src/lib/store-concurrency.test.ts`（100 级消息/角色并发），并通过 `pnpm test:ai-web` 与生产演练验证。

## schema 与迁移

- 实体带稳定 ID、owner 与时间戳；`schemaVersion` 目标为 `1.0`。
- `apps/ai-web/scripts/migrate-data.ts`（`pnpm migrate:data`）支持 dry-run、备份、校验和与回滚。
- 已知缺口：消息记录尚未补齐 `schemaVersion`，迁移未接入启动/Compose。

## 架构测试

`apps/ai-web/src/acceptance/architecture.test.ts` 扫描业务目录，禁止直接 `node:fs` 或导入旧 store 模块（放行仓储适配器与 store 实现）。

## 如何新增仓储

1. 定义端口接口与领域类型。
2. 实现文件适配器（复用 store 工具）与内存适配器。
3. 在 repository contract 测试中让两种实现跑同一契约。
4. 路由只通过端口调用，不直接拼接 `/data` 路径。
