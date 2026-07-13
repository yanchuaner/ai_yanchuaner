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

# 先检查网关本身，避免把服务未启动误判为流式调用失败。
$health = Invoke-RestMethod -Uri "$baseUrl/health/liveliness" -TimeoutSec 10
if ($health -ne "I'm alive!") {
    throw "LiteLLM 健康检查返回异常。"
}

$body = @{
    model = $env:LITELLM_TEST_MODEL
    messages = @(
        @{
            role = "user"
            content = "请用五个简短段落介绍人类探索星空的意义，每段不超过六十字。"
        }
    )
    max_tokens = 400
    stream = $true
} | ConvertTo-Json -Depth 5

$client = [System.Net.Http.HttpClient]::new()
$client.Timeout = [TimeSpan]::FromSeconds(120)
$request = [System.Net.Http.HttpRequestMessage]::new(
    [System.Net.Http.HttpMethod]::Post,
    "$baseUrl/v1/chat/completions"
)
$request.Headers.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new(
    "Bearer",
    $env:LITELLM_TEST_KEY
)
$request.Content = [System.Net.Http.StringContent]::new(
    $body,
    [System.Text.Encoding]::UTF8,
    "application/json"
)

$response = $null
$reader = $null
$stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
$fragmentCount = 0
$firstFragmentMilliseconds = $null
$requestId = $null
$receivedDone = $false

try {
    # 只等待响应头，正文到达一段就立即读取一段，避免客户端自行缓冲完整回答。
    $response = $client.SendAsync(
        $request,
        [System.Net.Http.HttpCompletionOption]::ResponseHeadersRead
    ).GetAwaiter().GetResult()

    if (-not $response.IsSuccessStatusCode) {
        $apiMessage = $null
        try {
            $errorBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
            $errorPayload = $errorBody | ConvertFrom-Json
            $apiMessage = $errorPayload.error.message
        } catch {
            $apiMessage = $null
        }

        if ($apiMessage) {
            throw "流式请求失败，HTTP 状态码：$([int]$response.StatusCode)。LiteLLM：$apiMessage"
        }

        throw "流式请求失败，HTTP 状态码：$([int]$response.StatusCode)。请检查虚拟 Key、模型权限和上游渠道。"
    }

    $contentType = $response.Content.Headers.ContentType.MediaType
    if ($contentType -ne "text/event-stream") {
        throw "响应类型为 $contentType，并非预期的 text/event-stream。"
    }

    $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
    $reader = [System.IO.StreamReader]::new($stream)

    Write-Output "开始接收流式内容："
    while (-not $reader.EndOfStream) {
        $line = $reader.ReadLineAsync().GetAwaiter().GetResult()
        if (-not $line.StartsWith("data:")) {
            continue
        }

        $data = $line.Substring(5).Trim()
        if ($data -eq "[DONE]") {
            $receivedDone = $true
            break
        }

        if (-not $data) {
            continue
        }

        $event = $data | ConvertFrom-Json
        if (-not $requestId -and $event.id) {
            $requestId = $event.id
        }

        $content = $event.choices[0].delta.content
        if (-not [string]::IsNullOrEmpty([string]$content)) {
            if ($null -eq $firstFragmentMilliseconds) {
                $firstFragmentMilliseconds = $stopwatch.ElapsedMilliseconds
            }

            $fragmentCount++
            Write-Host -NoNewline $content
        }
    }

    Write-Host
    $stopwatch.Stop()

    if ($fragmentCount -eq 0) {
        throw "流式连接成功，但没有收到文本片段。"
    }

    if (-not $receivedDone) {
        throw "收到了文本片段，但没有收到流式结束标记 [DONE]。"
    }

    Write-Output "流式输出测试通过"
    Write-Output "模型：$($env:LITELLM_TEST_MODEL)"
    Write-Output "请求编号：$requestId"
    Write-Output "文本片段数：$fragmentCount"
    Write-Output "首段延迟：$firstFragmentMilliseconds 毫秒"
    Write-Output "总耗时：$($stopwatch.ElapsedMilliseconds) 毫秒"
} finally {
    if ($reader) {
        $reader.Dispose()
    }
    if ($response) {
        $response.Dispose()
    }
    $request.Dispose()
    $client.Dispose()
}
