#!/usr/bin/env bash
# 甲骨文云 (OCI) 全球节点实时延迟监控系统 — 一键更新升级脚本
# 用法:
#   本地目录执行: bash update.sh
#   远程一键更新: curl -fsSL https://raw.githubusercontent.com/AdoreYL/oci-latency-monitor/main/update.sh | bash

set -euo pipefail

readonly DEFAULT_REPO="AdoreYL/oci-latency-monitor"
readonly REPOSITORY="${OCI_MONITOR_REPO:-$DEFAULT_REPO}"
readonly BRANCH="${OCI_MONITOR_BRANCH:-main}"
readonly ARCHIVE_URL="https://github.com/${REPOSITORY}/archive/refs/heads/${BRANCH}.tar.gz"

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
echo "${C_BOLD}   🔄  甲骨文云 (OCI) 实时延迟监控 — 一键更新升级${C_RESET}"
echo "${C_BOLD}============================================================${C_RESET}"
echo ""

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=("docker" "compose")
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=("docker-compose")
else
  die "未检测到 docker compose，请先安装 Docker Compose。"
fi

# 定位已安装的项目目录
if [[ -f "./docker-compose.yml" && -f "./src/server.js" ]]; then
  TARGET_DIR="$(pwd)"
elif [[ -d "./oci-latency-monitor" && -f "./oci-latency-monitor/docker-compose.yml" ]]; then
  TARGET_DIR="$(pwd)/oci-latency-monitor"
else
  DIR_NAME="$(prompt_var "请输入已安装的项目目录名称或路径" "oci-latency-monitor")"
  if [[ "$DIR_NAME" == /* ]]; then
    TARGET_DIR="$DIR_NAME"
  else
    TARGET_DIR="$(pwd)/${DIR_NAME}"
  fi
fi

if [[ ! -d "$TARGET_DIR" ]]; then
  die "未找到安装目录: ${TARGET_DIR}，请先运行 install.sh 进行安装。"
fi

# 备份原有的 .env 配置文件（保留用户自定义的端口与容器名）
temp_dir="$(mktemp -d)"
cleanup() {
  rm -rf "$temp_dir"
}
trap cleanup EXIT INT TERM HUP

if [[ -f "${TARGET_DIR}/.env" ]]; then
  cp -f "${TARGET_DIR}/.env" "${temp_dir}/.env.backup"
  info "已备份现有配置 (${TARGET_DIR}/.env)"
fi

archive_path="${temp_dir}/project.tar.gz"
info "正在从 GitHub (${REPOSITORY}@${BRANCH}) 拉取最新版本..."
curl -fsSL "$ARCHIVE_URL" -o "$archive_path"
tar -xzf "$archive_path" -C "$temp_dir"

extracted_dir="$(find "$temp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
if [[ -z "$extracted_dir" || ! -f "${extracted_dir}/Dockerfile" ]]; then
  die "下载的更新包不完整，未找到 Dockerfile。"
fi

cp -Rf "${extracted_dir}/." "$TARGET_DIR/"
if [[ -f "${temp_dir}/.env.backup" ]]; then
  cp -f "${temp_dir}/.env.backup" "${TARGET_DIR}/.env"
fi

cd "$TARGET_DIR"
chmod +x install.sh update.sh uninstall.sh 2>/dev/null || true

HOST_PORT_VAL="6689"
if [[ -f ".env" ]]; then
  HOST_PORT_VAL="$(grep -E '^HOST_PORT=' .env | cut -d'=' -f2- || echo "6689")"
fi

info "正在重新构建并启动最新版本容器 (${COMPOSE_CMD[*]} up -d --build)..."
"${COMPOSE_CMD[@]}" up -d --build

info "正在验证更新后的服务状态..."
health_ok=0
for _ in 1 2 3 4 5 6; do
  if curl -fsS "http://127.0.0.1:${HOST_PORT_VAL}/api/health" >/dev/null 2>&1; then
    health_ok=1
    break
  fi
  sleep 1
done

echo ""
if [[ "$health_ok" -eq 1 ]]; then
  echo "${C_GREEN}${C_BOLD}🎉 更新升级成功！现有配置与端口 (${HOST_PORT_VAL}) 已完整保留。${C_RESET}"
else
  warn "容器已重启，请通过 '${COMPOSE_CMD[*]} logs -f' 查看运行日志。"
fi
echo ""
