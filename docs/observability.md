# 可观测性

目标：workflow event → sanitize → observability hub → exporter → 查询入口。

## 事件与脱敏

工作流运行时发布 `run.*`/`step.*` 事件（见 [workflow.md](workflow.md)）。事件进入 `apps/ai-web/src/observability/port.ts` 的 hub，先经 `sanitizeForLog` 再交给 exporter。

`sanitizeForLog` 按敏感键名（authorization、cookie、access key、grant、api key、secret、token、password、message、content、text、body、knowledge、upload、image、audio）递归替换为 `[REDACTED]`。

## JSONL Exporter

`apps/ai-web/src/observability/jsonl-exporter.ts` 保存白名单字段：

```text
schemaVersion, eventId, entity, phase, runId, stepId, messageId,
capabilityId, traceId, clientRequestId, requestId, timestamp,
errorCode, durationMs, outcome, conversationId
```

禁止保存：用户消息正文、知识片段、token、api key、cookie、grant。

## 轮转与查询

- 默认路径：`/data/observability/events.jsonl`，可用 `AI_WEB_OBSERVABILITY_FILE` 覆盖。
- 单文件超过 `AI_WEB_OBSERVABILITY_MAX_BYTES`（默认 50 MiB）时轮转，保留 `AI_WEB_OBSERVABILITY_KEEP_ROTATED`（默认 5）个历史文件。
- 查询入口：`GET /api/admin/observability/events?requestId=...`（仅管理员）。
- 查询跨当前与历史文件，单行损坏不中断。

## 已知缺口

- 查询为全文件扫描，无索引；文件增长后查询成本线性上升。
- 无告警通道；exporter 失败被静默吞掉。

`durationMs` 与 `outcome` 由工作流运行时真实生成：completed→success、failed→failure、cancelled→cancelled、degraded→degraded，并记录步骤与运行耗时；`errorCode` 在失败与取消事件中保留。

## 日志

容器日志使用 Docker `json-file` 驱动，单文件 `10 MB`、保留 5 个文件（Compose 全局配置）。
