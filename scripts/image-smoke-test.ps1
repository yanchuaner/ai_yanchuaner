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

if ([string]::IsNullOrWhiteSpace($env:OPENWEBUI_IMAGE_LITELLM_KEY)) {
    throw "请先运行 .\scripts\configure-gpt-image.ps1。"
}

$baseUrl = if ([string]::IsNullOrWhiteSpace($env:LITELLM_BASE_URL)) {
    "http://localhost:4000"
} else {
    $env:LITELLM_BASE_URL.TrimEnd("/")
}

$headers = @{
    Authorization = "Bearer $($env:OPENWEBUI_IMAGE_LITELLM_KEY)"
    "Content-Type" = "application/json"
}

$body = @{
    model = "gpt-image-2"
    prompt = "一张简洁的校园社群活动配图，蓝天、教学楼与并肩协作的年轻人，不含文字和标志"
    n = 1
    size = "1024x1024"
    quality = "low"
} | ConvertTo-Json -Depth 5

try {
    $response = Invoke-RestMethod `
        -Method Post `
        -Uri "$baseUrl/v1/images/generations" `
        -Headers $headers `
        -Body $body `
        -TimeoutSec 300
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

    if ($statusCode -and $apiMessage) {
        throw "图片请求失败，HTTP 状态码：$statusCode。LiteLLM：$apiMessage"
    }
    if ($statusCode) {
        throw "图片请求失败，HTTP 状态码：$statusCode。请检查模型权限、预算和上游凭据。"
    }
    throw "图片请求失败：$($_.Exception.Message)"
}

$image = $response.data | Select-Object -First 1
if (-not $image) {
    throw "请求成功，但响应中没有图片数据。"
}

$outputDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "ai-yanchuaner"
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
$outputPath = Join-Path $outputDirectory "gpt-image-2-smoke.png"

if (-not [string]::IsNullOrWhiteSpace([string]$image.b64_json)) {
    [System.IO.File]::WriteAllBytes($outputPath, [Convert]::FromBase64String([string]$image.b64_json))
} elseif (-not [string]::IsNullOrWhiteSpace([string]$image.url)) {
    Invoke-WebRequest -UseBasicParsing -Uri ([string]$image.url) -OutFile $outputPath -TimeoutSec 120
} else {
    throw "请求成功，但响应既没有 b64_json 也没有图片 URL。"
}

$outputFile = Get-Item -LiteralPath $outputPath
if ($outputFile.Length -lt 1024) {
    throw "图片文件异常，文件大小只有 $($outputFile.Length) 字节。"
}

Write-Output "图片生成冒烟测试通过"
Write-Output "模型：gpt-image-2"
Write-Output "图片路径：$outputPath"
Write-Output "文件大小：$([math]::Round($outputFile.Length / 1KB, 1)) KB"
