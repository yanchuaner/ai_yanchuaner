$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "未找到本地 .env 文件：$envFile"
}

# 读取本地环境变量，但不把任何变量值输出到终端。
Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or -not $line.Contains("=")) {
        return
    }

    $pair = $line.Split("=", 2)
    $name = $pair[0].Trim()
    $value = $pair[1].Trim()

    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
    }

    Set-Item -Path "Env:$name" -Value $value
}

if ([string]::IsNullOrWhiteSpace($env:LITELLM_TEST_KEY)) {
    throw "请先在 .env 中配置 LITELLM_TEST_KEY。"
}

if ([string]::IsNullOrWhiteSpace($env:LITELLM_TEST_MODEL)) {
    throw "请先在 .env 中配置 LITELLM_TEST_MODEL。"
}

$baseUrl = if ([string]::IsNullOrWhiteSpace($env:LITELLM_BASE_URL)) {
    "http://localhost:4000"
} else {
    $env:LITELLM_BASE_URL.TrimEnd("/")
}

# 先检查网关本身，便于区分“服务未启动”和“模型调用失败”。
$health = Invoke-RestMethod -Uri "$baseUrl/health/liveliness" -TimeoutSec 10
if ($health -ne "I'm alive!") {
    throw "LiteLLM 健康检查返回异常。"
}

$headers = @{
    Authorization = "Bearer $($env:LITELLM_TEST_KEY)"
    "Content-Type" = "application/json"
}

$body = @{
    model = $env:LITELLM_TEST_MODEL
    messages = @(
        @{
            role = "user"
            content = "请只回复：燕中 AI 冒烟测试通过"
        }
    )
    max_tokens = 50
    stream = $false
} | ConvertTo-Json -Depth 5

try {
    $response = Invoke-RestMethod `
        -Method Post `
        -Uri "$baseUrl/v1/chat/completions" `
        -Headers $headers `
        -Body $body `
        -TimeoutSec 60
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    $apiMessage = $null
    if ($_.ErrorDetails.Message) {
        try {
            $errorPayload = $_.ErrorDetails.Message | ConvertFrom-Json
            $apiMessage = $errorPayload.error.message
        } catch {
            $apiMessage = $null
        }
    }

    if ($statusCode) {
        if ($apiMessage) {
            throw "模型请求失败，HTTP 状态码：$statusCode。LiteLLM：$apiMessage"
        }

        throw "模型请求失败，HTTP 状态码：$statusCode。请检查虚拟 Key、模型权限和上游渠道。"
    }

    throw "模型请求失败：$($_.Exception.Message)"
}

$content = $response.choices[0].message.content
if ([string]::IsNullOrWhiteSpace([string]$content)) {
    throw "请求成功，但模型没有返回有效文本。"
}

Write-Output "冒烟测试通过"
Write-Output "模型：$($env:LITELLM_TEST_MODEL)"
Write-Output "请求编号：$($response.id)"
Write-Output "模型回复：$content"
