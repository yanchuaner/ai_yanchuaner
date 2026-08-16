#!/usr/bin/env bash
set -Eeuo pipefail

# 磁盘治理：清理悬空镜像/构建缓存与超龄 ai-web 日期镜像，并检查水位告警。
# 用法：disk-governance.sh [--dry-run|--check]
# 环境变量：AI_WEB_KEEP_IMAGES（保留的日期镜像数，默认 5）、
#          DOCKER_PRUNE_UNTIL（悬空镜像/缓存保留窗口，默认 72h）、
#          AI_WEB_DISK_ALERT_PERCENT（磁盘使用率告警阈值，默认 85）。

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"

dry_run=false
check_only=false
if [[ "${1:-}" == "--dry-run" ]]; then
  dry_run=true
elif [[ "${1:-}" == "--check" ]]; then
  check_only=true
fi
keep="${AI_WEB_KEEP_IMAGES:-5}"
prune_until="${DOCKER_PRUNE_UNTIL:-72h}"
alert_percent="${AI_WEB_DISK_ALERT_PERCENT:-85}"

mode_label=""
if [[ "$dry_run" == true ]]; then mode_label=" (dry-run)"; fi
if [[ "$check_only" == true ]]; then mode_label="${mode_label} (check-only)"; fi
echo "磁盘治理开始：$(date -u +%FT%TZ)${mode_label}"
df -h / | tail -1

if [[ "$check_only" != true ]]; then
  if [[ "$dry_run" == true ]]; then
    echo "[dry-run] docker image prune -f --filter until=${prune_until}"
    echo "[dry-run] docker builder prune -f --filter until=${prune_until}"
  else
    docker image prune -f --filter "until=${prune_until}" || true
    docker builder prune -f --filter "until=${prune_until}" || true
  fi

  mapfile -t stale_images < <(
    docker images --format '{{.Repository}}:{{.Tag}}' |
      grep '^ai-yanchuaner/ai-web:' |
      grep -Ev ':(preview|phase-1)$' |
      sort -r |
      tail -n "+$((keep + 1))"
  )

  if [[ ${#stale_images[@]} -gt 0 ]]; then
    if [[ "$dry_run" == true ]]; then
      for image in "${stale_images[@]}"; do
        echo "[dry-run] docker rmi ${image}"
      done
    else
      docker rmi "${stale_images[@]}" || true
      echo "已清理 ${#stale_images[@]} 个 ai-web 历史镜像标签"
    fi
  else
    echo "无需清理 ai-web 历史镜像"
  fi
fi

echo "磁盘治理结束：$(date -u +%FT%TZ)"
df -h / | tail -1

usage_percent="$(df -P / | awk 'NR==2 {gsub("%", "", $5); print $5}')"
if [[ "$usage_percent" -ge "$alert_percent" ]]; then
  echo "DISK_ALERT: / 使用率 ${usage_percent}% 已达到告警阈值 ${alert_percent}%" >&2
  exit 1
fi
echo "磁盘水位正常：${usage_percent}% < ${alert_percent}%"
