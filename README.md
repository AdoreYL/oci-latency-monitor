# oci-latency-monitor

甲骨文云 (OCI) 全球 40+ 官方区域节点实时延迟、丢包率与波动趋势监控工具。采用**本地浏览器直连测速架构**（服务器仅负责下发网页界面与官方节点列表，零转发、零发包负担），完美兼容宝塔、1Panel、Nginx Proxy Manager、Caddy 等 HTTPS 反向代理。

---

## ✨ 核心特性

- **纯本地浏览器直连测速（服务器零发包）**：
  - 打开网页后，由访问者本地电脑/手机浏览器直接连接甲骨文云全球 40 个官方区域公共网关（`objectstorage.<region>.oraclecloud.com`），真实反映本地宽带到各机房的 HTTPS Keep-Alive RTT 延迟与**丢包率 (%)**。
  - 部署该服务的服务器仅在初次打开页面时下发静态资源与节点清单，持续测速期间服务器 **0 流量、0 发包、0 风控风险**。
- **双层折线图可视化**：
  - 每个节点行内嵌 **SVG 实时迷你折线图 (Sparkline)** 与丢包率标签。
  - **点击任意节点**可弹出查看最近 50 轮采样的**高清历史延迟波动大图**（含均值参考线与超时丢包标记）。
- **官方新区域自动发现**：
  - 支持从甲骨文官方开源 SDK (`oracle/oci-python-sdk`) 自动拉取新开通的商业云区域，经 DNS 存活解析校验通过后自动归入四大洲；离线环境自动使用内置 40 个官方节点兜底。
- **反向代理零配置兼容**：
  - 单容器同源托管，全相对路径 API 调用，反代绑定 HTTPS 域名即装即用。
- **全架构支持**：
  - 原生支持 `x86_64 (amd64)` 与 `ARM64 (aarch64)`（包括甲骨文云 Ampere A1 ARM 实例）。

---

## 🚀 快速安装（推荐）

在服务器上进入您希望存放项目的目录，执行以下一键安装命令：

```bash
# Debian / Ubuntu / CentOS / Alpine 一键交互式远程安装
curl -fsSL https://raw.githubusercontent.com/AdoreYL/oci-latency-monitor/main/install.sh | bash
```

> **若仓库设置为 Private（私有仓库）**，请携带您的 GitHub Token 执行：
> ```bash
> GITHUB_TOKEN=您的GitHub_Token bash -c "$(curl -fsSL -H 'Authorization: token 您的GitHub_Token' https://raw.githubusercontent.com/AdoreYL/oci-latency-monitor/main/install.sh)"
> ```

运行后安装器会自动引导您确认以下参数（直接按回车即可采用默认值）：
1. **安装目录名称**（默认：`oci-latency-monitor`）
2. **宿主机访问端口**（默认：`6689`）
3. **Docker 容器名称**（默认：`oci-latency-monitor`）
4. **是否开启启动时自动同步甲骨文官方新区域**（默认：`Y`）

确认后脚本会自动拉取项目到当前目录、生成 `.env` 配置并执行 `docker compose up -d --build`。

---

## 🔧 手动克隆与 Docker Compose 部署

```bash
git clone https://github.com/AdoreYL/oci-latency-monitor.git
cd oci-latency-monitor
docker compose up -d --build
```

启动后：
- **本地/内网访问**：`http://服务器IP:6689`
- **反向代理配置（宝塔 / 1Panel / NPM / Caddy）**：将您的域名直接反向代理至 `http://127.0.0.1:6689` 即可。

---

## 🛠️ 常用管理命令

进入安装目录（默认 `cd oci-latency-monitor`）后：

| 操作 | 命令 |
|------|------|
| 查看运行状态 | `docker compose ps` |
| 查看实时日志 | `docker compose logs -f` |
| 修改端口后重新生效 | 编辑 `.env` 中的 `HOST_PORT` 后执行 `docker compose up -d` |
| 更新重启服务 | `docker compose up -d --build` |
| 停止并移除容器 | `docker compose down` |
| 运行单元测试 | `node --test test/server.test.js` |

---

## 🔒 安全说明

- 部署服务器仅下发前端页面与甲骨文官方区域清单，不提供服务端代理 Ping 接口，彻底杜绝服务端被恶意利用扫描外部网络或触发云厂商发包风控警告。
- 零外部第三方前端统计脚本与冗余依赖，基于官方 `node:20-alpine` 极简镜像运行。
