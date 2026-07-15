#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

if [[ $# -ne 2 || "$1" != "--yes" ]]; then
  echo "用法：$0 --yes <备份目录>" >&2
  echo "警告：该命令会覆盖当前 LiteLLM 数据库和 Open WebUI 数据卷。" >&2
  exit 2
fi

backup_dir="$(realpath "$2")"
for file in litellm.sql open-webui-data.tar.gz runtime.env images.txt SHA256SUMS; do
  if [[ ! -f "$backup_dir/$file" ]]; then
    echo "备份缺少文件：$file" >&2
    exit 1
  fi
done
if [[ ! -f .env ]]; then
  echo "项目根目录缺少 .env，请先安全上传并设置生产地址。" >&2
  exit 1
fi

echo "正在校验备份..."
(
  cd "$backup_dir"
  sha256sum -c SHA256SUMS
  tar -tzf open-webui-data.tar.gz >/dev/null
)

echo "正在恢复 LiteLLM PostgreSQL..."
docker compose stop open-webui litellm >/dev/null 2>&1 || true
docker compose up -d db
for _ in {1..30}; do
  if docker compose exec -T db pg_isready --username litellm --dbname litellm >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
docker compose exec -T db pg_isready --username litellm --dbname litellm >/dev/null
docker compose exec -T db psql \
  --quiet \
  --username litellm \
  --dbname litellm \
  --set ON_ERROR_STOP=1 \
  --single-transaction < "$backup_dir/litellm.sql"

echo "正在恢复 Open WebUI 数据卷..."
docker compose run --rm --no-deps -T --entrypoint sh open-webui \
  -c 'find /app/backend/data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && tar -C /app/backend/data -xzf -' \
  < "$backup_dir/open-webui-data.tar.gz"

docker compose up -d
echo "恢复完成，请执行 ./scripts/health-check.sh 并验证管理员登录。"
