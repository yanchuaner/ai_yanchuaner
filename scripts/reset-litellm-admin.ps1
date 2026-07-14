$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectRoot ".env"
$uiUsername = "yanchuaner"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "未找到本地 .env 文件：$envFile"
}

function Set-DotEnvValue([string]$Name, [string]$Value) {
    if ($Value.Contains("`r") -or $Value.Contains("`n")) {
        throw "环境变量 $Name 不能包含换行符。"
    }

    $content = [System.IO.File]::ReadAllText($envFile)
    $pattern = "(?m)^$([regex]::Escape($Name))=.*$"
    $line = "$Name=$Value"

    if ([regex]::IsMatch($content, $pattern)) {
        $content = [regex]::Replace($content, $pattern, $line)
    } else {
        if ($content.Length -gt 0 -and -not $content.EndsWith("`n")) {
            $content += [Environment]::NewLine
        }
        $content += $line + [Environment]::NewLine
    }

    $utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($envFile, $content, $utf8WithoutBom)
}

$firstPassword = Read-Host "请输入 LiteLLM 管理界面新密码（输入内容不会显示）" -AsSecureString
$secondPassword = Read-Host "请再次输入新密码" -AsSecureString
$firstPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($firstPassword)
$secondPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secondPassword)
$plainPassword = $null
$confirmation = $null

try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPointer)
    $confirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPointer)

    if ([string]::IsNullOrWhiteSpace($plainPassword)) {
        throw "密码不能为空。"
    }
    if ($plainPassword -cne $confirmation) {
        throw "两次输入的密码不一致。"
    }

    Set-DotEnvValue "LITELLM_UI_USERNAME" $uiUsername
    Set-DotEnvValue "LITELLM_UI_PASSWORD" $plainPassword
} finally {
    if ($firstPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPointer)
    }
    if ($secondPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPointer)
    }
    $plainPassword = $null
    $confirmation = $null
}

docker compose up -d --force-recreate litellm
if ($LASTEXITCODE -ne 0) {
    throw "LiteLLM 容器重建失败。"
}

$healthy = $false
for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:4000/health/liveliness" -TimeoutSec 5
        if ($response -eq "I'm alive!") {
            $healthy = $true
            break
        }
    } catch {
        # 容器启动后，HTTP 服务还需要短暂时间恢复。
    }
    Start-Sleep -Seconds 3
}

if (-not $healthy) {
    throw "LiteLLM 未在 90 秒内恢复健康。请执行 docker compose logs litellm。"
}

Write-Output "LiteLLM 管理界面登录已重置"
Write-Output "登录地址：http://localhost:4000/ui"
Write-Output "用户名：$uiUsername"
