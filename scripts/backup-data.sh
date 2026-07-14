#!/usr/bin/env bash
set -Eeuo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

if [[ ! -f .env ]]; then
  echo "未找到本地 .env 文件" >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_root="${BACKUP_DIR:-$project_root/backups}"
backup_dir="$backup_root/$timestamp"
mkdir -p "$backup_dir"
umask 077
chmod 700 "$backup_dir"

cleanup() {
  docker compose start open-webui >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "正在备份 LiteLLM PostgreSQL..."
docker compose exec -T db pg_dump \
  --username litellm \
  --dbname litellm \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges > "$backup_dir/litellm.sql"

echo "正在短暂停止 Open WebUI 以生成一致性归档..."
docker compose stop open-webui >/dev/null
docker compose run --rm --no-deps --entrypoint sh open-webui \
  -c 'tar -C /app/backend/data -czf - .' > "$backup_dir/open-webui-data.tar.gz"
docker compose start open-webui >/dev/null
trap - EXIT

cp .env "$backup_dir/runtime.env"
docker compose config --images > "$backup_dir/images.txt"
(
  cd "$backup_dir"
  sha256sum litellm.sql open-webui-data.tar.gz runtime.env images.txt > SHA256SUMS
)

echo "备份完成：$backup_dir"
echo "该目录包含真实密钥，必须保存在受限位置。"
