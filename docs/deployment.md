# 燕中 AI 生产部署与低维护运行

本文面向 Ubuntu 24.04 单机部署。目标是让燕中网站与 AI 工作台共用一台服务器，同时保持端口隔离、成本可控、数据可恢复。文中的域名、服务器地址和密钥均为占位符。

## 1. 部署边界

```text
互联网
  ├─ https://yanchuaner.cn    → Nginx → 127.0.0.1:3000 → Next.js
  └─ https://ai.example.com   → Nginx → 127.0.0.1:3001 → Open WebUI
                                                   ↓ Docker 内网
                                        LiteLLM:4000 → 模型上游
                                                   ↓
                                            PostgreSQL:5432
```

| 服务 | 宿主机监听 | 是否公开 |
| --- | --- | --- |
| 燕中网站 | `127.0.0.1:3000` | 仅通过 Nginx |
| Open WebUI | `127.0.0.1:3001` | 仅通过 Nginx |
| LiteLLM | `127.0.0.1:4000` | 否，使用 SSH 隧道管理 |
| PostgreSQL | 无宿主机映射 | 否 |

云安全组和系统防火墙只开放 `22`、`80`、`443`。访问 LiteLLM 管理界面时，在管理员电脑建立隧道：

```bash
ssh -L 4000:127.0.0.1:4000 <服务器用户>@<服务器地址>
```

随后访问 `http://127.0.0.1:4000/ui`。

## 2. 资源基线

当前三个 AI 容器稳定空闲时合计约占 `0.9 GiB` 内存，冷启动阶段可能接近 `1.8 GiB`。网站与 AI 同机部署的推荐配置是 `2 vCPU / 4 GiB RAM / 40 GiB 可用磁盘`。

`1 vCPU / 2 GiB RAM` 只适合注册关闭、图片并发为 1、少量管理员使用的过渡环境，并且必须：

- 配置至少 `4 GiB` swap。
- 不在服务器构建 Next.js 或 Docker 镜像。
- 保持 Compose 中的内存上限和日志轮转。
- 每周检查内存、OOM、磁盘、备份和上游余额。
- 扩大到多人同时使用前升级服务器规格。

创建 swap 前先执行 `swapon --show`，已有足够 swap 时不要重复创建：

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 3. 首次部署

1. 安装 Docker Engine、Compose 插件、Nginx、Certbot、`curl`、`jq`。
2. 将仓库放到固定目录，例如 `/opt/yanchuaner/ai_yanchuaner`。
3. 从 `.env.example` 创建仅管理员可读的 `.env`，使用新的生产密钥。
4. 同机部署时设置：

```env
OPENWEBUI_HOST_PORT=3001
OPENWEBUI_URL=https://ai.example.com
OPENWEBUI_CORS_ALLOW_ORIGIN=https://ai.example.com
OPENWEBUI_ENABLE_SIGNUP=False
```

5. 启动并检查：

```bash
cd /opt/yanchuaner/ai_yanchuaner
chmod 600 .env
docker compose pull
docker compose up -d
./scripts/health-check.sh
```

6. 创建或恢复 LiteLLM 模型、凭据和虚拟 Key，再同步暑期成本策略。
7. 初始化唯一 Open WebUI 管理员后立即关闭注册。
8. 将 `deploy/nginx/ai.yanchuaner.cn.conf` 中的示例域名替换为真实 AI 域名，签发 HTTPS 证书。
9. 网站生产环境设置 `AI_WORKSPACE_URL=https://ai.example.com`。

LiteLLM 和 Open WebUI 的数据库配置具有持久化优先级。轮换虚拟 Key 后，必须同时更新 `.env` 和 Open WebUI 管理面板中的对应连接。

## 4. 成本和访问策略

LiteLLM 以美元累计成本。DeepSeek 上游的人民币报价按固定汇率 `1 USD = 7.0 CNY` 保守换算，只用于预算保护，不作为财务结算依据。

| 模型 | 输入未命中 | 输入缓存命中 | 输出/图片 |
| --- | ---: | ---: | ---: |
| `deepseek-v4-flash` | 1 元/百万 token | 0.02 元/百万 token | 2 元/百万 token |
| `deepseek-v4-pro` | 3 元/百万 token | 0.025 元/百万 token | 6 元/百万 token |
| `gpt-image-2` | - | - | 0.1 美元/张 |

运行 `scripts/harden-summer-runtime.ps1` 后：

- 文本 Key：`3 USD / 30d`，RPM 20，TPM 20000。
- 图片 Key：`3 USD / 30d`，约 30 张图，RPM 2，并发 1。
- 自动巡检 Key：`1 USD / 30d`，RPM 5，TPM 5000。
- 三个 Key 的有效期均延长为 90 天。

该脚本还会把上述价格写入三个已注册模型。若模型不存在，脚本会失败并停止，避免出现“有预算但成本为零”的假保护。每次更换模型或渠道后都应重新执行并在 LiteLLM 管理界面核对。

## 5. Nginx 与 HTTPS

仓库配置已经包含：

- Open WebUI 上游端口 `127.0.0.1:3001`。
- WebSocket 与流式响应支持。
- 25 MB 请求体限制。
- 登录接口按客户端 IP 限流。
- 基础安全响应头。

安装前先替换示例域名和证书路径，再执行：

```bash
sudo nginx -t
sudo systemctl reload nginx
sudo certbot renew --dry-run
```

不要把 `3001`、`4000` 或 `5432` 加入云安全组公网入站规则。

## 6. 自动恢复、日志与健康检查

- 三个容器均使用 `restart: unless-stopped`。
- PostgreSQL、LiteLLM、Open WebUI 分别限制为 `256 MiB`、`1.5 GiB`、`1 GiB`。内存限制是故障边界，不是预留量；低访问时实际占用应明显更低，冷启动峰值由 swap 承接。
- Docker JSON 日志单文件上限 `10 MB`，每个服务保留 `5` 个文件。
- 镜像使用摘要固定，暑期内不要执行无计划升级。

每次部署后执行：

```bash
docker compose ps
./scripts/health-check.sh
docker stats --no-stream
```

外部监控只访问 `https://ai.example.com/health`。内部健康脚本会通过 Compose 自动识别 Open WebUI 的实际宿主机端口。

## 7. 备份与恢复

`scripts/backup-data.sh` 会生成一致性备份：

- LiteLLM PostgreSQL SQL。
- Open WebUI 数据卷，包括账号、聊天、配置和图片。
- 运行 `.env`。
- 镜像清单和 SHA-256 校验文件。

Open WebUI 会短暂停止，退出或失败时脚本会自动尝试恢复服务。默认只清理超过 35 天且名称符合脚本时间戳格式的旧目录。可通过 `BACKUP_DIR` 和 `BACKUP_RETENTION_DAYS` 调整。

每周备份示例：

```cron
0 4 * * 0 cd /opt/yanchuaner/ai_yanchuaner && ./scripts/backup-data.sh >> /var/log/ai-yanchuaner-backup.log 2>&1
```

备份包含真实密钥，目录权限必须为 `700`，文件权限必须为 `600`。同盘备份不能应对云盘损坏，至少保留一份服务器外的加密副本。

恢复前必须停止服务并保留当前卷的副本。恢复顺序是 `.env`、PostgreSQL、Open WebUI 数据卷，最后执行 `docker compose up -d` 和健康检查。仓库提供显式确认的恢复脚本：

```bash
./scripts/restore-data.sh --yes /受限目录/备份时间戳
```

脚本会先验证 SHA-256 和压缩归档，再覆盖数据库与数据卷。正式恢复前应在临时环境完成一次演练，禁止直接在唯一生产副本上试验。

## 8. 两个月运行检查

每周执行一次：

```bash
free -h
swapon --show
df -h /
docker compose ps
docker stats --no-stream
docker system df
sudo journalctl -k --since '8 days ago' | grep -i -E 'oom|out of memory' || true
tail -n 50 /var/log/ai-yanchuaner-backup.log
```

同时确认：

- 网站与 AI 的 HTTPS 证书有效。
- 文本、图片 Key 到期时间覆盖暑期结束。
- 两个 Key 的月度预算均为 3 美元且支出没有异常。
- 上游账号余额充足，图片仍按 0.1 美元/次计费。
- 最近一次备份校验通过，服务器外副本可访问。

## 9. 已知边界

- 文本和图片目前都是单上游，渠道故障时无法自动切换。
- `1 vCPU / 2 GiB` 没有多人并发余量，swap 只能避免瞬时 OOM，不能提升性能。
- 暑期冻结期间不升级 LiteLLM、Open WebUI、PostgreSQL 主版本，不接入 Agent、BYOK 或开放注册。
- 上游价格变化后必须同步成本配置，否则 LiteLLM 的美元预算不再准确。
