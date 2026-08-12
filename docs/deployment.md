# 燕中 AI 生产部署与低维护运行

本文面向 Ubuntu 24.04 单机部署。目标是让燕中网站与 AI 工作台共用一台服务器，同时保持端口隔离、成本可控、数据可恢复。文中的域名、服务器地址和密钥均为占位符。

## 1. 部署边界

```text
互联网
  ├─ https://yanchuaner.cn    → Nginx → 127.0.0.1:3000 → Next.js
  ├─ https://api.example.com  → Nginx → 127.0.0.1:3101 → 燕中 API
  └─ https://ai.example.com   → Nginx → 127.0.0.1:3002 → 自主 ai-web
                                                        ↓ Docker 内网
                                              燕中 API → LiteLLM:4000
                                                        ↓
                                                 模型上游 / PostgreSQL
```

| 服务 | 宿主机监听 | 是否公开 |
| --- | --- | --- |
| 燕中网站 | `127.0.0.1:3000` | 仅通过 Nginx |
| 燕中 API | `127.0.0.1:3101` | 仅通过 Nginx |
| 自主 ai-web | `127.0.0.1:3002` | 仅通过 Nginx |
| Open WebUI（过渡） | `127.0.0.1:3001` | 仅内网/SSH 隧道 |
| LiteLLM | `127.0.0.1:4000` | 否，使用 SSH 隧道管理 |
| PostgreSQL | 无宿主机映射 | 否 |

云安全组和系统防火墙只开放 `22`、`80`、`443`。访问 LiteLLM 管理界面时，在管理员电脑建立隧道：

```bash
ssh -L 4000:127.0.0.1:4000 <服务器用户>@<服务器地址>
```

随后访问 `http://127.0.0.1:4000/ui`。

## 2. 资源基线

2026-07-27 生产实测中，PostgreSQL、LiteLLM 与 Open WebUI 稳定后合计约占 `1.2 GiB` 内存，整机连同主站、燕中 API 和缓存约使用 `2.1 GiB`。Open WebUI 冷启动时会产生短时峰值，当前 `4 GiB swap` 已有约 `1.5 GiB` 在用。网站与 AI 同机部署的生产基线是 `2 vCPU / 4 GiB RAM / 40 GiB 系统盘 / 4 GiB swap`；服务器只运行固定镜像，不执行前端或 Docker 构建。

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
7. 通过主站 OIDC 登录并确认普通用户无法使用本地注册或本地密码；应急管理员账号只限运维保管。
8. 将 `deploy/nginx/ai.yanchuaner.cn.conf` 中的示例域名替换为真实 AI 域名，签发 HTTPS 证书。
9. 网站生产环境设置 `AI_WORKSPACE_URL=https://ai.example.com`。

LiteLLM 和 Open WebUI 的数据库配置具有持久化优先级。轮换 `OPENWEBUI_API_KEY` 后，必须同时更新 `.env` 和 Open WebUI 管理面板中的对应连接。OAuth-only 入口也必须同时核对 Open WebUI `config` 表中的 `ui.enable_login_form=false` 与 `oauth.auto_redirect=true`；历史持久化值会覆盖 Compose 环境变量，不能只凭容器环境判定入口已关闭。

Open WebUI 当前共享服务 Key 只能记入独立服务账户，不能证明个人调用归属，不得据此静默扣减个人公益额度。发布逐用户计费前，必须验收用户级令牌交换或可信身份透传。未取得 Open WebUI 书面或企业许可时，还必须监控并限制滚动 30 日直接用户不超过 50 人。

## 4. 成本和访问策略

### 4.1 当前身份与计费边界

自主 ai-web 已上线 `ai.yanchuaner.cn`：只允许成员通过主站 OIDC 登录，BFF 完成 YanCore 主体交换并取得逐登录短期 Key，再经燕中 API 调用 DeepSeek。主站 `role=admin` 映射为管理员，`alumni`、`student`、`teacher` 映射为普通用户；其他角色不得进入。

截至 2026-08-12，生产 OIDC issuer 为 `https://yanchuaner.cn`，`ai.yanchuaner.cn` 已切换为自主 ai-web 并通过真实成员登录、DeepSeek 对话与额度流水验收。`staging.yanchuaner.cn` 不再签发身份；Open WebUI 保留在 `127.0.0.1:3001` 仅作过渡/内网管理，不再作为公网产品入口。

自主 `ai-web` 使用逐登录短期 Key，模型请求在 API 控制面按个人主体归因并写入额度流水与审计。Open WebUI 仍使用独立共享服务 Key，只允许内网/隧道访问，不得再向公网开放，也不得把共享账户调用解释为个人公益额度。

暑期预览只面向少量已认证成员，不开放匿名访问和公开注册。普通成员主域登录已由项目负责人确认；扩大范围前仍必须完成角色同步、会话撤销和用户级账单验收。

ai-web 会话按用户持久化在 `ai_web_data:/data` 卷中（对话与用量元数据，不包含主站 token、grant 或应用 Key）。容器以 uid 1001 运行，首次创建卷后需执行一次 `chown 1001:1001 /data`；恢复与备份时把该卷与其他数据卷同等对待。

LiteLLM 以美元累计成本。DeepSeek 上游的人民币报价按固定汇率 `1 USD = 7.0 CNY` 保守换算，只用于预算保护，不作为财务结算依据。

| 模型 | 输入未命中 | 输入缓存命中 | 输出/图片 |
| --- | ---: | ---: | ---: |
| `deepseek-v4-flash` | 1 元/百万 token | 0.02 元/百万 token | 2 元/百万 token |
| `deepseek-v4-pro` | 3 元/百万 token | 0.025 元/百万 token | 6 元/百万 token |

运行 `scripts/harden-summer-runtime.ps1` 后，以下额度是 LiteLLM 历史 PoC Key 的服务级总额，不是个人额度，也不能替代燕中 API 的预算与账本：

- 文本 Key：`3 USD / 30d`，RPM 20，TPM 20000。
- 图片 Key：`3 USD / 30d`，约 30 张图，RPM 2，并发 1。
- 自动巡检 Key：`1 USD / 30d`，RPM 5，TPM 5000。
- 三个 Key 的有效期均延长为 90 天。

该脚本还会把上述价格写入三个已注册模型。若模型不存在，脚本会失败并停止，避免出现“有预算但成本为零”的假保护。每次更换模型或渠道后都应重新执行并在 LiteLLM 管理界面核对。

## 5. Nginx 与 HTTPS

仓库配置已经包含：

- 自主 ai-web 上游端口 `127.0.0.1:3002`。
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

外部监控只访问 `https://ai.example.com/api/health`。内部健康脚本会通过 Compose 自动识别 ai-web 的实际宿主机端口。

## 7. 备份与恢复

`scripts/backup-data.sh` 会生成一致性备份：

- LiteLLM PostgreSQL SQL。
- Open WebUI 数据卷，包括账号、聊天、配置和图片。
- ai-web 会话数据卷 `ai_web_data`，包括用户对话与用量元数据。
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

- 主站、燕中 API 与 AI 的 HTTPS 证书有效。
- 自主 ai-web 只提供主站 OIDC 登录，本地登录、密码鉴权和注册保持关闭。
- Open WebUI 服务 Key、模型白名单和总预算有效，且没有异常支出。
- 自主 `ai-web` 的短期 Key、逐用户预算和审计链路没有跨用户复用。
- 上游账号余额充足，DeepSeek 预算与用量正常。
- 最近一次备份校验通过，服务器外副本可访问。

当前生产环境由 `/etc/cron.d/yanchuaner-backups` 统一调度：主站每日 `02:15` 备份，AI 每周日 `04:00` 备份，两项任务均使用 `flock` 防止并发。AI 备份会短暂停止并重启 Open WebUI，健康检查包含有限冷启动重试；备份根目录及时间戳目录权限均为 `700`。

## 9. 已知边界

- 文本和图片目前都是单上游，渠道故障时无法自动切换。
- `1 vCPU / 2 GiB` 没有多人并发余量，swap 只能避免瞬时 OOM，不能提升性能。
- 暑期冻结期间不升级 LiteLLM、Open WebUI、PostgreSQL 主版本，不接入 Agent、BYOK 或开放注册。
- 上游价格变化后必须同步成本配置，否则 LiteLLM 的美元预算不再准确。
- 生产服务器使用本地固定标签的 `docker-compose.override.yml` 适配离线导入镜像；该文件只属于服务器，不提交仓库。升级镜像前必须同时核对仓库摘要与服务器标签。
- AI 证书当前有效至 2026-10-13，Certbot 定时续期已启用；到期前必须完成一次续期演练。不要为了自动化把 DNS API 凭据随意留在服务器。
