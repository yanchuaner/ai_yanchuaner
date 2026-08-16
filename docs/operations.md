# 运维

本文覆盖健康检查、日志、request_id 排查、观测/账本查询、备份恢复与故障处理。

## 健康检查

```bash
docker compose ps
./scripts/health-check.sh
docker stats --no-stream
curl -s -o /dev/null -w '%{http_code}\n' https://ai.yanchuaner.cn/api/health
```

`scripts/health-check.sh` 覆盖 db/litellm/open-webui/ai-web 四个服务，ai-web 通过 `docker compose port` 定位后请求 `/api/health`。外部监控仍可单独访问 `https://ai.yanchuaner.cn/api/health`。

服务启动时执行配置校验与生产数据迁移：配置无效或迁移失败会立即退出（fail-fast），不会以 503 空转。

## 日志

```bash
docker logs --tail 100 ai-yanchuaner-ai-web-1
docker logs -f ai-yanchuaner-ai-web-1
```

容器日志 JSON 驱动单文件上限 10 MB、保留 5 个文件；观测事件在 `/data/observability/events.jsonl`（轮转见 [observability.md](observability.md)）。

## 按 request_id 排查

1. 在浏览器响应头或存储消息中找到 `request_id`（网关 `X-Request-ID`）。
2. 查询观测事件：

```bash
curl -H "Cookie: yc_ai_session=..." \
  "https://ai.yanchuaner.cn/api/admin/observability/events?requestId=<request_id>"
```

3. 查询用户账本（`/api/me/ledger`）确认 reserve/settlement/refund 终态。
4. 若需要网关侧日志，使用管理员控制面按 request_id 查询（不在本仓范围）。

## 观测与账本

- 观测：管理员 `GET /api/admin/observability/events?requestId=...`。
- 账本：`GET /api/me/ledger?page=1&pageSize=20`。
- 故障注入验收：`node scripts/acceptance/run-fault-injection.mjs --scenario <name>`。

## 备份恢复

### 备份

```bash
cd /opt/yanchuaner/ai_yanchuaner
./scripts/backup-data.sh
```

备份内容：LiteLLM PostgreSQL SQL、Open WebUI 数据卷、ai-web 数据卷（`ai-web-data.tar.gz`，含会话/角色/世界/知识/记忆/BYOK/观测）、`.env`、镜像清单与 SHA256SUMS。备份会短暂停止 Open WebUI 与 ai-web，结束后自动恢复；随后自动执行磁盘治理。

### 恢复

```bash
./scripts/restore-data.sh --yes /受限目录/备份时间戳
```

恢复顺序：校验备份 → 恢复 PostgreSQL → 恢复 Open WebUI 卷 → 恢复 ai-web 卷 → 启动服务。旧备份缺少 `ai-web-data.tar.gz` 时明确警告并跳过 AI Web 恢复。

### 验证方式

```bash
cd /受限目录/备份时间戳
sha256sum -c SHA256SUMS
tar -tzf ai-web-data.tar.gz
```

建议在临时卷演练恢复（`scripts/ai-web-data-archive.sh restore <归档> <临时卷>`），再对照文件校验和。

## 磁盘治理

```bash
bash scripts/disk-governance.sh --dry-run
bash scripts/disk-governance.sh
bash scripts/disk-governance.sh --check
```

保留最新 5 个 ai-web 日期镜像与 `preview`/`phase-1`；悬空镜像与构建缓存按 `DOCKER_PRUNE_UNTIL`（默认 72h）清理。磁盘使用率达到 `AI_WEB_DISK_ALERT_PERCENT`（默认 85%）时输出 `DISK_ALERT` 并返回退出码 1；`--check` 只检查不清理。每周备份 cron 会自动执行治理与检查。

## 账本对账

```bash
pnpm reconcile:ledger
```

脚本拉取本地会话消息的 `request_id`/usage，与网关 `logs`、`quota_ledger_entries` 比对，输出 machine-readable JSON；发现缺日志、缺账本、悬挂 reserve、usage/金额不一致时退出码为 1。在服务器本机执行时加 `--local`（避免 SSH 回环）；建议与备份 cron 一起每周执行。

## 故障处理

### 模型失败

- 现象：SSE 中断、上游错误、`do_request_failed`。
- 动作：按 `request_id` 查观测与账本；上游失败应出现 `reserve + refund`（净 0）。恢复上游后重试。

### 网关失败

- 现象：401/403/429/5xx。
- 动作：401 清除会话重新登录；429 等待后重试；5xx 用新 `client_request_id` 或等 BFF 去重 TTL 后再试，避免同键双扣。

### 计费异常

- 现象：同一操作出现多组 reserve/settlement，或失败请求出现 settlement。
- 动作：用 request_id 查 `quota_ledger_entries`；确认 BFF 去重是否生效（同键第二请求应 409）；运行 `pnpm reconcile:ledger` 自动对账，必要时人工核对 `scripts/verify-ai-web-identity.ps1`。

### 数据恢复

- 现象：JSON 文件损坏或数据卷丢失。
- 动作：先停止 ai-web，使用最近备份执行 `restore-data.sh`；恢复后校验文件数量与校验和；确认 `chown 1001:1001 /data`。

## 已知缺口

- 磁盘告警为脚本级（日志 + 退出码），尚无外部告警通道（邮件/IM）。
- 备份离站副本仍为人工同步。
- 观测查询无索引。
