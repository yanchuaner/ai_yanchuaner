# 燕中 AI 生产部署与两个月低维护运行

本文面向单台 Linux 服务器，目标是只公开 Open WebUI，LiteLLM 管理界面和 PostgreSQL 保持服务器本机可见。

## 发布边界

```text
互联网
  ↓ HTTPS 443
Nginx（ai.yanchuaner.cn）
  ↓ 127.0.0.1:3000
Open WebUI
  ↓ Docker 内网
LiteLLM → 模型上游
  ↓
PostgreSQL
```

- 防火墙只开放 `22`、`80`、`443`。
- 不公开 `3000`、`4000`、`5432`。
- LiteLLM 管理界面通过 SSH 隧道访问：`ssh -L 4000:127.0.0.1:4000 user@server`。
- Open WebUI 保持关闭注册，暑期仅保留一个超级管理员。

## 首次部署

1. 将仓库部署到服务器固定目录，例如 `/opt/yanchuaner/ai_yanchuaner`。
2. 从 `.env.example` 创建 `.env`，重新生成生产密钥，不复制本机开发密钥。
3. 设置生产地址：

```env
OPENWEBUI_URL=https://ai.yanchuaner.cn
OPENWEBUI_CORS_ALLOW_ORIGIN=https://ai.yanchuaner.cn
OPENWEBUI_ENABLE_SIGNUP=False
```

4. 启动并检查：

```bash
docker compose pull
docker compose up -d
./scripts/health-check.sh
```

5. 配置 DNS，将 `ai.yanchuaner.cn` 指向服务器公网 IP。
6. 安装 Nginx 与 Certbot，将 `deploy/nginx/ai.yanchuaner.cn.conf` 放入站点配置目录并签发证书。
7. 在网站生产环境设置 `AI_WORKSPACE_URL=https://ai.yanchuaner.cn`，再部署网站。

## 发布前固定运行策略

在生产 LiteLLM 已完成模型和虚拟 Key 配置后执行：

```powershell
.\scripts\harden-summer-runtime.ps1
```

脚本将文本与图片 Key 都延长为 90 天，并设置每 30 天 5 美元预算。部署日期变化时，以 LiteLLM 管理界面显示的到期时间为准，必须覆盖整个暑期。

## 自动恢复与日志

- 三个容器都使用 `restart: unless-stopped`，服务器或 Docker 重启后会自动恢复。
- Docker JSON 日志单文件上限 `10 MB`，每个服务保留 `5` 个文件。
- 每次部署后执行 `docker compose ps` 和 `./scripts/health-check.sh`。
- 建议使用外部 HTTPS 监控每 5 分钟访问 `https://ai.yanchuaner.cn/health`，连续失败时发送通知。

## 备份

`scripts/backup-data.sh` 会备份：

- LiteLLM PostgreSQL SQL 文件。
- Open WebUI 数据卷，包括账号、聊天、配置和生成图片。
- 生产 `.env`。
- 当前容器镜像清单与校验和。

脚本会短暂停止 Open WebUI，以保证 SQLite 和文件归档一致。建议每周日凌晨执行：

```cron
0 4 * * 0 cd /opt/yanchuaner/ai_yanchuaner && ./scripts/backup-data.sh >> /var/log/ai-yanchuaner-backup.log 2>&1
```

备份目录含真实密钥，必须限制为管理员可读，并额外复制到服务器之外的加密存储。首次上线后立即执行一次备份并验证 `SHA256SUMS`。

## 恢复演练

恢复前先复制当前 `.env` 和数据卷，禁止直接覆盖唯一副本。

1. 停止服务但保留数据卷：`docker compose down`。
2. 恢复备份中的 `runtime.env` 为 `.env`。
3. 启动数据库：`docker compose up -d db litellm`。
4. 恢复 PostgreSQL：

```bash
cat litellm.sql | docker compose exec -T db psql --username litellm --dbname litellm
```

5. 停止 Open WebUI，清空其数据卷后，将 `open-webui-data.tar.gz` 解压到 `/app/backend/data`。
6. 执行 `docker compose up -d` 和 `./scripts/health-check.sh`。
7. 验证管理员登录、文本对话、图片生成和预算限制。

清空数据卷属于破坏性操作，正式恢复前必须先在临时服务器完成一次演练。

## 两个月运行检查

每周只需检查一次：

```bash
docker compose ps
./scripts/health-check.sh
docker system df
tail -n 50 /var/log/ai-yanchuaner-backup.log
```

同时在 LiteLLM 管理界面确认文本与图片 Key 未被阻断、预算未异常增长、到期时间仍覆盖暑期结束日期。
