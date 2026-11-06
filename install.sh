#!/usr/bin/env bash
# 甲骨文云 (OCI) 全球节点实时延迟监控系统 — 一键远程安装 / 更新 / 卸载脚本
# 用法:
#   一键安装或打开管理菜单:
#     curl -fsSL https://raw.githubusercontent.com/AdoreYL/oci-latency-monitor/main/install.sh | bash
#   一键更新升级:
#     curl -fsSL https://raw.githubusercontent.com/AdoreYL/oci-latency-monitor/main/install.sh | bash -s -- update
#   一键彻底卸载:
#     curl -fsSL https://raw.githubusercontent.com/AdoreYL/oci-latency-monitor/main/install.sh | bash -s -- uninstall

set -euo pipefail

readonly DEFAULT_REPO="AdoreYL/oci-latency-monitor"
readonly REPOSITORY="${OCI_MONITOR_REPO:-$DEFAULT_REPO}"
readonly BRANCH="${OCI_MONITOR_BRANCH:-main}"
readonly ARCHIVE_URL="https://github.com/${REPOSITORY}/archive/refs/heads/${BRANCH}.tar.gz"
readonly ACTION="${1:-}"

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

check_docker_env() {
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
}

detect_existing_dir() {
  if [[ -f "./docker-compose.yml" && -f "./src/server.js" ]]; then
    printf '%s' "$(pwd)"
  elif [[ -d "./oci-latency-monitor" && -f "./oci-latency-monitor/docker-compose.yml" ]]; then
    printf '%s' "$(pwd)/oci-latency-monitor"
  else
    printf ''
  fi
}

download_repo_to_dir() {
  local dest_dir="$1"
  local temp_dir
  temp_dir="$(mktemp -d)"

  local archive_path="${temp_dir}/project.tar.gz"
  info "正在从 GitHub (${REPOSITORY}@${BRANCH}) 拉取最新项目文件..."

  local curl_args=(-fsSL "$ARCHIVE_URL" -o "$archive_path")
  if [[ -n "${GITHUB_TOKEN:-}" ]]; then
    curl_args=(-fsSL -H "Authorization: token ${GITHUB_TOKEN}" "$ARCHIVE_URL" -o "$archive_path")
  fi

  if ! curl "${curl_args[@]}"; then
    rm -rf "$temp_dir"
    die "拉取项目压缩包失败，请检查服务器网络连接。"
  fi

  tar -xzf "$archive_path" -C "$temp_dir"
  local extracted_dir
  extracted_dir="$(find "$temp_dir" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  if [[ -z "$extracted_dir" || ! -f "${extracted_dir}/Dockerfile" ]]; then
    rm -rf "$temp_dir"
    die "解压后的项目结构不完整，未找到 Dockerfile。"
  fi

  mkdir -p "$dest_dir"
  cp -Rf "${extracted_dir}/." "$dest_dir/"
  chmod +x "${dest_dir}/install.sh" "${dest_dir}/update.sh" "${dest_dir}/uninstall.sh" 2>/dev/null || true
  rm -rf "$temp_dir"
}

wait_for_health() {
  local port="$1"
  info "正在等待服务就绪..."
  for _ in 1 2 3 4 5 6; do
    if curl -fsS "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  return 1
}

do_update() {
  local target_dir="${1:-}"
  if [[ -z "$target_dir" ]]; then
    target_dir="$(detect_existing_dir)"
  fi
  if [[ -z "$target_dir" || ! -d "$target_dir" ]]; then
    local dir_name
    dir_name="$(prompt_var "请输入已安装的项目目录名称或路径" "oci-latency-monitor")"
    if [[ "$dir_name" == /* ]]; then
      target_dir="$dir_name"
    else
      target_dir="$(pwd)/${dir_name}"
    fi
  fi

  if [[ ! -d "$target_dir" ]]; then
    die "未找到已安装目录: ${target_dir}，请先执行安装。"
  fi

  local env_backup=""
  if [[ -f "${target_dir}/.env" ]]; then
    env_backup="$(cat "${target_dir}/.env")"
    info "已读取并保留现有配置 (${target_dir}/.env)"
  fi

  download_repo_to_dir "$target_dir"

  if [[ -n "$env_backup" ]]; then
    printf '%s\n' "$env_backup" > "${target_dir}/.env"
    chmod 600 "${target_dir}/.env"
  fi

  cd "$target_dir"
  local host_port="6689"
  if [[ -f ".env" ]]; then
    host_port="$(grep -E '^HOST_PORT=' .env | cut -d'=' -f2- || echo "6689")"
  fi

  info "正在重新构建并启动最新容器 (${COMPOSE_CMD[*]} up -d --build)..."
  "${COMPOSE_CMD[@]}" up -d --build

  echo ""
  if wait_for_health "$host_port"; then
    echo "${C_GREEN}${C_BOLD}🎉 更新升级完成！端口 (${host_port}) 与原有配置已完整保留。${C_RESET}"
  else
    warn "容器已重启，请使用 '${COMPOSE_CMD[*]} logs -f' 查看运行日志。"
  fi
  echo ""
}

do_uninstall() {
  local target_dir="${1:-}"
  if [[ -z "$target_dir" ]]; then
    target_dir="$(detect_existing_dir)"
  fi
  if [[ -z "$target_dir" ]]; then
    local dir_name
    dir_name="$(prompt_var "请输入要卸载的项目目录名称或路径" "oci-latency-monitor")"
    if [[ "$dir_name" == /* ]]; then
      target_dir="$dir_name"
    else
      target_dir="$(pwd)/${dir_name}"
    fi
  fi

  local confirm
  confirm="$(prompt_var "确认停止并卸载 ${target_dir} 下的容器与镜像吗？(y/N)" "N")"
  if [[ ! "$confirm" =~ ^[yY]$ ]]; then
    info "已取消卸载。"
    exit 0
  fi

  if [[ -d "$target_dir" && -f "${target_dir}/docker-compose.yml" ]]; then
    info "正在停止并移除 Docker 容器与本地构建镜像..."
    (cd "$target_dir" && "${COMPOSE_CMD[@]}" down --rmi local --volumes --remove-orphans) || true
  fi

  if [[ -d "$target_dir" ]]; then
    local del_dir
    del_dir="$(prompt_var "是否同时删除项目文件夹 ${target_dir}？(Y/n)" "Y")"
    if [[ ! "$del_dir" =~ ^[nN]$ ]]; then
      if [[ "$(pwd)" == "$target_dir" ]]; then
        cd ..
      fi
      rm -rf "$target_dir"
      info "已彻底删除项目目录: ${target_dir}"
    else
      info "已保留项目目录文件: ${target_dir}"
    fi
  fi

  echo ""
  echo "${C_GREEN}${C_BOLD}✅ 卸载完成！${C_RESET}"
  echo ""
}

do_install() {
  info "请配置安装参数（直接按回车键使用默认值）："
  echo ""

  local install_dir_name
  install_dir_name="$(prompt_var "请输入安装到当前目录下的文件夹名称" "${INSTALL_DIR:-oci-latency-monitor}")"
  if [[ -z "$install_dir_name" || "$install_dir_name" == "/" || "$install_dir_name" == ".." ]]; then
    die "非法的安装目录名称: ${install_dir_name}"
  fi

  local host_port_val
  host_port_val="$(prompt_var "请输入宿主机映射端口 (用于反代或浏览器访问)" "${HOST_PORT:-6689}")"
  if [[ ! "$host_port_val" =~ ^[0-9]+$ ]] || (( host_port_val < 1 || host_port_val > 65535 )); then
    die "端口必须是 1~65535 之间的数字，当前输入: ${host_port_val}"
  fi

  local container_name_val
  container_name_val="$(prompt_var "请输入 Docker 容器名称" "${CONTAINER_NAME:-oci-latency-monitor}")"
  if [[ ! "$container_name_val" =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]]; then
    die "容器名称仅允许包含字母、数字、下划线、点或连字符: ${container_name_val}"
  fi

  local auto_sync_input
  auto_sync_input="$(prompt_var "是否开启启动时自动从甲骨文官方同步新区域 (Y/n)" "${AUTO_SYNC_REGIONS:-Y}")"
  local auto_sync_val="true"
  if [[ "$auto_sync_input" =~ ^[nN] ]]; then
    auto_sync_val="false"
  fi

  local target_dir
  if [[ -f "./Dockerfile" && -f "./src/server.js" && "$(basename "$(pwd)")" == "$install_dir_name" ]]; then
    target_dir="$(pwd)"
    info "检测到当前已在项目源码目录内，跳过远程下载。"
  else
    target_dir="$(pwd)/${install_dir_name}"
    download_repo_to_dir "$target_dir"
    info "项目文件已成功写入: ${target_dir}"
  fi

  cd "$target_dir"

  cat > .env <<EOF
HOST_PORT=${host_port_val}
CONTAINER_NAME=${container_name_val}
AUTO_SYNC_REGIONS=${auto_sync_val}
EOF
  chmod 600 .env
  info "已生成配置文件: ${target_dir}/.env"

  info "正在启动 Docker 容器 (${COMPOSE_CMD[*]} up -d --build)..."
  "${COMPOSE_CMD[@]}" up -d --build

  echo ""
  if wait_for_health "$host_port_val"; then
    echo "${C_GREEN}${C_BOLD}🎉 安装并启动成功！${C_RESET}"
  else
    warn "容器已启动，但本地健康检查暂未响应，请使用 '${COMPOSE_CMD[*]} logs -f' 查看日志。"
  fi

  echo "────────────────────────────────────────────────────────────"
  echo "  📁 项目安装目录 : ${target_dir}"
  echo "  🌐 本地访问地址 : http://127.0.0.1:${host_port_val}"
  echo "  🔗 反向代理目标 : http://127.0.0.1:${host_port_val} (宝塔 / 1Panel / NPM / Caddy 直接反代此地址)"
  echo ""
  echo "  🔄 一键更新升级 :"
  echo "     curl -fsSL https://raw.githubusercontent.com/${REPOSITORY}/${BRANCH}/install.sh | bash -s -- update"
  echo "     (或在目录内执行: bash update.sh)"
  echo ""
  echo "  🗑️  一键彻底卸载 :"
  echo "     curl -fsSL https://raw.githubusercontent.com/${REPOSITORY}/${BRANCH}/install.sh | bash -s -- uninstall"
  echo "     (或在目录内执行: bash uninstall.sh)"
  echo "────────────────────────────────────────────────────────────"
  echo ""
}

echo ""
echo "${C_BOLD}============================================================${C_RESET}"
echo "${C_BOLD}   🖥️  甲骨文云 (OCI) 全球节点实时延迟监控 — 管理与安装器${C_RESET}"
echo "${C_BOLD}============================================================${C_RESET}"
echo ""

check_docker_env

case "$ACTION" in
  update|upgrade)
    do_update ""
    exit 0
    ;;
  uninstall|remove)
    do_uninstall ""
    exit 0
    ;;
  install)
    do_install
    exit 0
    ;;
esac

# 若未传参且检测到当前目录已安装，自动弹出管理菜单
EXISTING_DIR="$(detect_existing_dir)"
if [[ -n "$EXISTING_DIR" ]]; then
  info "检测到已存在的安装目录: ${EXISTING_DIR}"
  echo ""
  echo "  请选择要执行的操作："
  echo "    ${C_GREEN}1)${C_RESET} 更新升级 (保留现有端口与配置，拉取最新代码并重启)"
  echo "    ${C_CYAN}2)${C_RESET} 重新配置并安装 (修改端口 / 容器名称)"
  echo "    ${C_RED}3)${C_RESET} 彻底卸载 (停止并删除容器、镜像及项目文件夹)"
  echo "    0) 退出"
  echo ""
  CHOICE="$(prompt_var "请输入选项编号" "1")"
  echo ""
  case "$CHOICE" in
    1) do_update "$EXISTING_DIR" ;;
    2) do_install ;;
    3) do_uninstall "$EXISTING_DIR" ;;
    *) info "已退出。"; exit 0 ;;
  esac
else
  do_install
fi
