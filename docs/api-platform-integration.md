# API 平台集成

燕中 AI 保留唯一 LiteLLM 数据面，Open WebUI 只作为过渡客户端。所有面向用户、工作台和 Agent 的调用先经过 `api_yanchuaner` 中的 YanCore 主体与权益控制面，再由兼容网关和受限内部渠道进入 LiteLLM。

```text
自主 AI Web BFF --逐登录应用 Key--+
Open WebUI --------共享服务 Key-----+--> New API (api-gateway)
Agent / 校友 API Key ---------------+
              |
              v
     LiteLLM (litellm-gateway)
              |
              v
       获授权的官方模型
```

两个仓库通过外部 Docker 网络 `yanchuaner-ai-core` 连接。Open WebUI 使用 New API 签发的独立服务 Token，不再直接使用 LiteLLM 虚拟 Key；LiteLLM master key 仍只用于本地管理。

用户身份由主站统一提供。Open WebUI 同时关闭登录表单、密码鉴权、本地注册和首次本地管理员注册，通过主站 OIDC 自动创建已认证成员账号；`role=admin` 映射为管理员，`alumni/student/teacher` 映射为普通用户。API 平台使用同一身份源的独立 OAuth 客户端，两个下游互不复用客户端密钥。容器内通过 `host.docker.internal` 访问主站的发现、令牌和用户信息端点，浏览器授权与回调仍使用 `localhost` 或正式 HTTPS 域名。

Open WebUI `0.10.2` 会把全新数据库中的首个 OAuth 用户提升为管理员，先于角色管理生效。首次启动只能监听回环地址，由受信任的主站管理员先登录，完成 `scripts/verify-openwebui-oidc-callback.ps1` 后才能开放反向代理；这属于过渡依赖的明确运行边界，不属于燕中自主身份实现。

启动顺序由 `api_yanchuaner/scripts/bootstrap-integrated-stack.ps1` 统一处理。单独启动本仓库前，必须确保外部网络和 `api-gateway` 已存在，否则 Open WebUI 虽可启动但不能调用模型。

## 当前归因边界

阶段 1 已定义 YanCore Subject Grant 并为自主 AI Web 实现逐登录、短期、有限预算的应用 Key，见 `docs/yancore-subject-grant-client.md`。自主路径的模型请求可归因到映射后的 API 用户；Open WebUI 仍使用受限服务 Key，只能记入独立服务账户，两条账路不得静默合并。

## 第三方与品牌边界

LiteLLM 和 Open WebUI 均是外部依赖，不属于燕中自主业务代码。缺少 Open WebUI 品牌授权不会阻止 YanCore 和自主 AI Web 研发，但 Open WebUI 不得作为燕中原创产品入口公开扩张；未取得书面或企业许可时必须保留必要标识或满足其许可证阈值。固定镜像、源码 revision 与许可见 `THIRD_PARTY_NOTICES.md`。
