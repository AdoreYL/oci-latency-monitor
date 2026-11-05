#!/usr/bin/env bash
# 甲骨文云 (OCI) 全球节点实时延迟与丢包监控系统 — 一键远程安装脚本
# 用法:
#   curl -fsSL https://raw.githubusercontent.com/AdoreYL/oci-latency-monitor/main/install.sh | bash

set -euo pipefail

readonly DEFAULT_REPO="AdoreYL/oci-latency-monitor"
readonly REPOSITORY="${OCI_MONITOR_REPO:-$DEFAULT_REPO}"
readonly BRANCH="${OCI_MONITOR_BRANCH:-main}"
readonly ARCHIVE_URL="https://github.com/${REPOSITORY}/archive/refs/heads/${BRANCH}.tar.gz"

# ── 终端颜色 ────────────────────────────────────────────────────────
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

# 兼容 curl | bash 管道模式的交互式读取函数（从 /dev/tty 读取）
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
echo "${C_BOLD}   🖥️  甲骨文云 (OCI) 全球节点实时延迟监控 — 一键安装器${C_RESET}"
echo "${C_BOLD}============================================================${C_RESET}"
echo ""

# ── 1. 检查基础依赖与 Docker 环境 ───────────────────────────────────
for cmd in curl tar; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    die "未找到基础命令: $cmd，请先安装 (如 apt install -y curl tar)。"
  fi
done

if ! command -v docker >/dev/null 2>&1; then
  die "未检测到 Docker，请先安装 Docker (如 curl -fsSL https://get.docker.com | bash)。"
fi

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=("docker" "compose")
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=("docker-compose")
else
  die "未检测到 docker compose 插件或 docker-compose 命令，请先安装 Docker Compose。"
fi

# ── 2. 交互式询问可配置变量 ─────────────────────────────────────────
info "请配置安装参数（直接按回车键使用默认值）："
echo ""

INSTALL_DIR_NAME="$(prompt_var "请输入安装到当前目录下的文件夹名称" "${INSTALL_DIR:-oci-latency-monitor}")"
if [[ -z "$INSTALL_DIR_NAME" || "$INSTALL_DIR_NAME" == "/" || "$INSTALL_DIR_NAME" == ".." ]]; then
  die "非法的安装目录名称: ${INSTALL_DIR_NAME}"
fi

HOST_PORT_VAL="$(prompt_var "请输入宿主机映射端口 (用于反代或浏览器访问)" "${HOST_PORT:-6689}")"
if [[ ! "$HOST_PORT_VAL" =~ ^[0-9]+$ ]] || (( HOST_PORT_VAL < 1 || HOST_PORT_VAL > 65535 )); then
  die "端口必须是 1~65535 之间的数字，当前输入: ${HOST_PORT_VAL}"
fi

CONTAINER_NAME_VAL="$(prompt_var "请输入 Docker 容器名称" "${CONTAINER_NAME:-oci-latency-monitor}")"
if [[ ! "$CONTAINER_NAME_VAL" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
  die "容器名称仅允许包含字母、数字、下划线、点或连字符: ${CONTAINER_NAME_VAL}"
fi

AUTO_SYNC_INPUT="$(prompt_var "是否开启启动时自动从甲骨文官方同步新区域 (Y/n)" "${AUTO_SYNC_REGIONS:-Y}")"
if [[ "$AUTO_SYNC_INPUT" =~ ^[nN] ]]; then
  AUTO_SYNC_VAL="false"
else
  AUTO_SYNC_VAL="true"
fi

TARGET_DIR="$(pwd)/${INSTALL_DIR_NAME}"
echo ""
info "安装目标路径: ${TARGET_DIR}"
info "宿主机端口  : ${HOST_PORT_VAL} -> 容器端口 3000"
info "容器名称    : ${CONTAINER_NAME_VAL}"
info "自动同步区域: ${AUTO_SYNC_VAL}"
echo ""

# ── 3. 下载或更新项目文件到当前目录 ─────────────────────────────────
if [[ -f "./Dockerfile" && -f "./src/server.js" && "$(pwd)" == "$TARGET_DIR" ]]; then
  info "检测到当前已在项目源码目录内，跳过远程下载。"
else
  temp_dir="$(mktemp -d)"
  cleanup() {
    rm -rf "$temp_dir"
  }
  trap cleanup EXIT INT TERM HUP

  archive_path="${temp_dir}/project.tar.gz"
  info "正在从 GitHub (${REPOSITORY}@${BRANCH}) 拉取项目源码..."

  curl_args=(-fsSL "$ARCHIVE_URL" -o "$archive_path")
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    curl_args=(-fsSL -H "Authorization: token ${GITHUB_TOKEN}" "$ARCHIVE_URL" -o "$archive_path")
  fi

  if ! curl "${curl_args[@]}"; then
    die "拉取项目压缩包失败！若仓库为私有 (Private)，请设置环境变量 GITHUB_TOKEN=<您的Token> 后重试。"
  fi

  tar -xzf "$archive_path" -C "$temp_dir"
  extracted_dir="$(find "$temp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  if [[ -z "$extracted_dir" || ! -f "${extracted_dir}/Dockerfile" ]]; then
    die "解压后的项目结构不完整，未找到 Dockerfile。"
  fi

  mkdir -p "$TARGET_DIR"
  cp -Rf "${extracted_dir}/." "$TARGET_DIR/"
  info "项目文件已成功写入: ${TARGET_DIR}"
fi

cd "$TARGET_DIR"

# ── 4. 写入 .env 环境变量配置 ───────────────────────────────────────
cat > .env <<EOF
HOST_PORT=${HOST_PORT_VAL}
CONTAINER_NAME=${CONTAINER_NAME_VAL}
AUTO_SYNC_REGIONS=${AUTO_SYNC_VAL}
EOF
chmod 600 .env
info "已生成配置文件: ${TARGET_DIR}/.env"

# ── 5. 执行 Docker Compose 构建与启动 ───────────────────────────────
info "正在启动 Docker 容器 (${COMPOSE_CMD[*]} up -d --build)..."
"${COMPOSE_CMD[@]}" up -d --build

# ── 6. 验证服务健康状态 ─────────────────────────────────────────────
info "正在等待服务就绪..."
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
  echo "${C_GREEN}${C_BOLD}🎉 安装并启动成功！${C_RESET}"
else
  warn "容器已启动，但本地健康检查暂未响应，请使用 '${COMPOSE_CMD[*]} logs -f' 查看日志。"
fi

echo "────────────────────────────────────────────────────────────"
echo "  📁 项目安装目录 : ${TARGET_DIR}"
echo "  🌐 本地访问地址 : http://127.0.0.1:${HOST_PORT_VAL}"
echo "  🔗 反向代理目标 : http://127.0.0.1:${HOST_PORT_VAL} (宝塔 / 1Panel / NPM / Caddy 直接反代此地址)"
echo ""
echo "  常用管理命令 (进入 cd ${TARGET_DIR} 后执行)："
echo "    查看状态 : ${COMPOSE_CMD[*]} ps"
echo "    查看日志 : ${COMPOSE_CMD[*]} logs -f"
echo "    重启服务 : ${COMPOSE_CMD[*]} restart"
echo "    停止卸载 : ${COMPOSE_CMD[*]} down"
echo "────────────────────────────────────────────────────────────"
echo ""
