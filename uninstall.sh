#!/usr/bin/env bash
# 甲骨文云 (OCI) 全球节点实时延迟监控系统 — 一键卸载脚本
# 用法:
#   本地目录执行: bash uninstall.sh
#   远程一键卸载: curl -fsSL https://raw.githubusercontent.com/AdoreYL/oci-latency-monitor/main/uninstall.sh | bash

set -euo pipefail

if [[ -t 1 ]]; then
  C_RED=$'\e[31m'; C_GREEN=$'\e[32m'; C_YELLOW=$'\e[33m'
  C_CYAN=$'\e[36m'; C_BOLD=$'\e[1m'; C_RESET=$'\e[0m'
else
  C_RED=''; C_GREEN=''; C_YELLOW=''
  C_CYAN=''; C_BOLD=''; C_RESET=''
fi

info()  { echo "${C_GREEN}[信息]${C_RESET} $*"; }
warn()  { echo "${C_YELLOW}[警告]${C_RESET} $*" >&2; }
error() { echo "${C_RED}${C_BOLD}[错误]${C_RESET} $*" >&2; }
die()   { error "$@"; exit 1; }

prompt_var() {
  local prompt_text="$1"
  local default_val="$2"
  local input_val=""
  if [[ -r /dev/tty ]]; then
    read -rp "${C_CYAN}?${C_RESET} ${prompt_text} [默认: ${default_val}]: " input_val </dev/tty || true
  fi
  input_val="${input_val:-$default_val}"
  printf '%s' "$input_val"
}

echo ""
echo "${C_BOLD}============================================================${C_RESET}"
echo "${C_BOLD}   🗑️  甲骨文云 (OCI) 实时延迟监控 — 卸载工具${C_RESET}"
echo "${C_BOLD}============================================================${C_RESET}"
echo ""

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=("docker" "compose")
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=("docker-compose")
else
  COMPOSE_CMD=()
fi

# 自动定位安装目录
if [[ -f "./docker-compose.yml" && -f "./src/server.js" ]]; then
  TARGET_DIR="$(pwd)"
elif [[ -d "./oci-latency-monitor" && -f "./oci-latency-monitor/docker-compose.yml" ]]; then
  TARGET_DIR="$(pwd)/oci-latency-monitor"
else
  DIR_NAME="$(prompt_var "请输入当初安装的目录名称或路径" "oci-latency-monitor")"
  if [[ "$DIR_NAME" == /* ]]; then
    TARGET_DIR="$DIR_NAME"
  else
    TARGET_DIR="$(pwd)/${DIR_NAME}"
  fi
fi

CONFIRM="$(prompt_var "确认停止并卸载 ${TARGET_DIR} 下的容器与服务吗？(y/N)" "N")"
if [[ ! "$CONFIRM" =~ ^[yY]$ ]]; then
  info "已取消卸载。"
  exit 0
fi

# 1. 停止并移除容器与镜像
if [[ -d "$TARGET_DIR" && -f "${TARGET_DIR}/docker-compose.yml" && ${#COMPOSE_CMD[@]} -gt 0 ]]; then
  info "正在停止并移除 Docker 容器与关联镜像..."
  (cd "$TARGET_DIR" && "${COMPOSE_CMD[@]}" down --rmi local --volumes --remove-orphans) || true
elif command -v docker >/dev/null 2>&1; then
  CONTAINER_NAME="oci-latency-monitor"
  if [[ -f "${TARGET_DIR}/.env" ]]; then
    CONTAINER_NAME="$(grep -E '^CONTAINER_NAME=' "${TARGET_DIR}/.env" | cut -d'=' -f2- || echo "oci-latency-monitor")"
  fi
  if docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    info "正在移除容器: ${CONTAINER_NAME}..."
    docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
fi

# 2. 询问是否删除项目目录文件
if [[ -d "$TARGET_DIR" ]]; then
  DEL_FILES="$(prompt_var "是否同时删除项目文件夹 ${TARGET_DIR}？(y/N)" "Y")"
  if [[ "$DEL_FILES" =~ ^[yY]$ ]]; then
    # 如果当前工作目录就在 TARGET_DIR 内，先退回上级目录
    if [[ "$(pwd)" == "$TARGET_DIR" ]]; then
      cd ..
    fi
    rm -rf "$TARGET_DIR"
    info "已删除项目目录: ${TARGET_DIR}"
  else
    info "已保留项目目录文件: ${TARGET_DIR}"
  fi
fi

echo ""
echo "${C_GREEN}${C_BOLD}✅ 卸载完成！${C_RESET}"
echo ""
