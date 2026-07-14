$ErrorActionPreference = "Stop"

$targetEmail = "yanchuaner@yanchuaner.cn"
$targetName = "燕中超级管理员"

$firstPassword = Read-Host "请输入 Open WebUI 新密码（输入内容不会显示）" -AsSecureString
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

    $payload = @{ password = $plainPassword } | ConvertTo-Json -Compress
    $pythonCode = @'
import asyncio
import json
import sys

from open_webui.models.auths import Auths
from open_webui.models.users import Users
from open_webui.utils.auth import get_password_hash, validate_password

TARGET_EMAIL = "yanchuaner@yanchuaner.cn"
TARGET_NAME = "燕中超级管理员"


async def main():
    payload = json.loads(sys.stdin.read())
    password = payload["password"]
    validate_password(password)
    password_hash = await get_password_hash(password)

    result = await Users.get_users(filter={"roles": ["admin"]}, limit=2)
    if result["total"] != 1:
        raise RuntimeError(f"预期只有一个管理员，实际为 {result['total']} 个")

    admin = result["users"][0]
    existing = await Users.get_user_by_email(TARGET_EMAIL)
    if existing and existing.id != admin.id:
        raise RuntimeError("目标邮箱已被其他 Open WebUI 用户占用")

    if not await Auths.update_email_by_id(admin.id, TARGET_EMAIL):
        raise RuntimeError("更新管理员邮箱失败")
    if not await Users.update_user_by_id(
        admin.id,
        {"name": TARGET_NAME, "role": "admin"},
    ):
        raise RuntimeError("更新管理员资料失败")
    if not await Auths.update_user_password_by_id(admin.id, password_hash):
        raise RuntimeError("更新管理员密码失败")


asyncio.run(main())
'@

    $payload | docker compose exec -T open-webui python3 -c $pythonCode
    if ($LASTEXITCODE -ne 0) {
        throw "重置 Open WebUI 管理员失败。"
    }
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

Write-Output "Open WebUI 管理员已重置"
Write-Output "登录邮箱：$targetEmail"
Write-Output "开放注册：关闭"
