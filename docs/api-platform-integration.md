# API 平台集成

燕中 AI 保留唯一 LiteLLM 数据面，Open WebUI 只作为过渡客户端。所有面向用户、工作台和 Agent 的调用先经过 `api_yanchuaner` 中的 YanCore 主体与权益控制面，再由兼容网关和受限内部渠道进入 LiteLLM。

```text
Open WebUI / Agent / 校友 API Key
              |
              v
      New API (api-gateway)
              |
              v
     LiteLLM (litellm-gateway)
              |
              v
       获授权的官方模型
```

两个仓库通过外部 Docker 网络 `yanchuaner-ai-core` 连接。Open WebUI 使用 New API 签发的独立服务 Token，不再直接使用 LiteLLM 虚拟 Key；LiteLLM master key 仍只用于本地管理。

用户身份由主站统一提供。Open WebUI 关闭本地注册，通过主站 OIDC 自动创建已认证校友账号；API 平台使用同一身份源的独立 OAuth 客户端，两个下游互不复用客户端密钥。容器内通过 `host.docker.internal` 访问主站的发现、令牌和用户信息端点，浏览器授权与回调仍使用 `localhost` 或正式 HTTPS 域名。

启动顺序由 `api_yanchuaner/scripts/bootstrap-integrated-stack.ps1` 统一处理。单独启动本仓库前，必须确保外部网络和 `api-gateway` 已存在，否则 Open WebUI 虽可启动但不能调用模型。

## 当前归因边界

阶段 1 已定义 YanCore Subject Grant 作为用户级委托协议，见 `docs/yancore-subject-grant-client.md`。自主 AI Web 入口完成前，Open WebUI 仍使用受限服务 Key；它不能证明个人调用归属，只能记入独立服务账户，不得静默扣减个人公益额度。

## 第三方与品牌边界

LiteLLM 和 Open WebUI 均是外部依赖，不属于燕中自主业务代码。缺少 Open WebUI 品牌授权不会阻止 YanCore 和自主 AI Web 研发，但 Open WebUI 不得作为燕中原创产品入口公开扩张；未取得书面或企业许可时必须保留必要标识或满足其许可证阈值。固定镜像、源码 revision 与许可见 `THIRD_PARTY_NOTICES.md`。
