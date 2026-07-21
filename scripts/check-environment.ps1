$ErrorActionPreference = "Stop"

$docker = (Get-Command docker -ErrorAction SilentlyContinue).Source
if (-not $docker) {
    $fallback = "C:\Program Files\Docker\Docker\resources\bin\docker.exe"
    if (Test-Path -LiteralPath $fallback) {
        $docker = $fallback
    } else {
        throw "未找到 Docker 命令。请启动 Docker Desktop 并重新打开 PowerShell。"
    }
}

& $docker compose config --quiet
if ($LASTEXITCODE -ne 0) {
    throw "Docker Compose 配置无效。"
}

$services = & $docker compose ps --status running --services
if ($LASTEXITCODE -ne 0) {
    throw "无法读取 Docker Compose 服务状态。"
}

$requiredServices = @("db", "litellm", "open-webui")
$missingServices = $requiredServices | Where-Object { $_ -notin $services }
if ($missingServices) {
    throw "以下服务未运行：$($missingServices -join ', ')。请执行 docker compose up -d。"
}

$response = $null
for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:4000/health/liveliness" -TimeoutSec 5
        if ($response -eq "I'm alive!") {
            break
        }
    } catch {
        # 容器进程启动后，HTTP 服务还可能需要短暂时间才能就绪。
    }

    Start-Sleep -Seconds 3
}

if ($response -ne "I'm alive!") {
    throw "LiteLLM 未在 90 秒内恢复健康。请执行 docker compose logs litellm。"
}

$openWebUiAddress = [string](& $docker compose port open-webui 8080 | Select-Object -First 1)
$openWebUiAddress = $openWebUiAddress.Trim()
if ([string]::IsNullOrWhiteSpace($openWebUiAddress)) {
    throw "无法读取 Open WebUI 的宿主机端口。"
}

$openWebUiHealthy = $false
for ($attempt = 1; $attempt -le 40; $attempt++) {
    try {
        $openWebUiResponse = Invoke-WebRequest -UseBasicParsing -Uri "http://$openWebUiAddress/health" -TimeoutSec 5
        if ($openWebUiResponse.StatusCode -eq 200) {
            $openWebUiHealthy = $true
            break
        }
    } catch {
        # 首次启动需要初始化本地数据库和界面资源，可能耗时较长。
    }

    Start-Sleep -Seconds 3
}

if (-not $openWebUiHealthy) {
    throw "Open WebUI 未在 120 秒内恢复健康。请执行 docker compose logs open-webui。"
}

$openWebUiConfig = Invoke-RestMethod -Uri "http://$openWebUiAddress/api/config" -TimeoutSec 10
if ($openWebUiConfig.features.enable_signup -ne $false) {
    throw "Open WebUI 运行时仍允许本地注册。"
}
if ($openWebUiConfig.features.enable_login_form -ne $false) {
    throw "Open WebUI 运行时仍显示本地登录表单。"
}
if (-not ($openWebUiConfig.oauth.providers.PSObject.Properties.Name -contains "oidc")) {
    throw "Open WebUI 运行时未加载主站 OIDC provider。"
}
$passwordLogin = Invoke-WebRequest -UseBasicParsing -Method Post `
    -Uri "http://$openWebUiAddress/api/v1/auths/signin" `
    -ContentType "application/json" `
    -Body '{"email":"local-auth-check@example.test","password":"not-a-password"}' `
    -SkipHttpErrorCheck -TimeoutSec 10
if ($passwordLogin.StatusCode -ne 403) {
    throw "Open WebUI 本地密码鉴权未在服务端关闭。"
}

Write-Output "Docker Compose 配置：有效"
Write-Output "PostgreSQL 服务：运行中"
Write-Output "LiteLLM 服务：运行中且健康"
Write-Output "Open WebUI 服务：运行中且健康"
Write-Output "Open WebUI 身份边界：仅主站 OIDC，本地密码与注册已关闭"
Write-Output "LiteLLM 管理界面：http://localhost:4000/ui"
Write-Output "燕中 AI 测试界面：http://$openWebUiAddress"
