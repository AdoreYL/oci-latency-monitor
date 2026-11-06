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

## 🚀 一键安装 / 更新升级 / 彻底卸载

### 1. 一键远程安装（推荐）

在服务器上进入您希望存放项目的目录，执行以下命令：

```bash
curl -fsSL https://raw.githubusercontent.com/AdoreYL/oci-latency-monitor/main/install.sh | bash
```

运行后脚本会自动引导您设置以下参数（**直接按回车即可采用默认值**）：
1. **安装目录名称**（默认：`oci-latency-monitor`）
2. **宿主机访问端口**（默认：`6689`）
3. **Docker 容器名称**（默认：`oci-latency-monitor`）
4. **是否开启启动时自动同步甲骨文官方新区域**（默认：`Y`）

> 💡 **智能管理菜单**：如果检测到当前目录已安装过本项目，再次运行上面这条命令会自动弹出交互式菜单（`1) 更新升级` / `2) 重新配置` / `3) 彻底卸载`）。

---

### 2. 一键更新升级（保留原有端口与配置）

后续项目有新版本时，会自动备份并保留您原有的 `.env` 端口配置，拉取最新代码并重建启动容器：

```bash
# 方式一：远程一键更新
curl -fsSL https://raw.githubusercontent.com/AdoreYL/oci-latency-monitor/main/install.sh | bash -s -- update

# 方式二：在项目目录内直接运行
bash update.sh
```

---

### 3. 一键彻底卸载

自动停止并移除 Docker 容器、清理本地构建镜像，并询问是否删除项目目录文件：

```bash
# 方式一：远程一键卸载
curl -fsSL https://raw.githubusercontent.com/AdoreYL/oci-latency-monitor/main/install.sh | bash -s -- uninstall

# 方式二：在项目目录内直接运行
bash uninstall.sh
```

---

## 🔗 反向代理配置（宝塔 / 1Panel / Nginx Proxy Manager / Caddy）

安装完成后：
- **内网/IP 直接访问**：`http://服务器IP:6689`
- **HTTPS 域名反向代理**：在宝塔 / 1Panel / NPM / Caddy 中新建反代站点，将目标地址指向 `http://127.0.0.1:6689` 即可。

---

## 🛠️ 常用 Docker Compose 命令

进入安装目录（默认 `cd oci-latency-monitor`）后：

| 操作 | 命令 |
|------|------|
| 更新升级（保留配置） | `bash update.sh` |
| 彻底卸载 | `bash uninstall.sh` |
| 查看运行状态 | `docker compose ps` |
| 查看实时日志 | `docker compose logs -f` |
| 修改端口后重新生效 | 编辑 `.env` 中的 `HOST_PORT` 后执行 `docker compose up -d` |
| 重启服务 | `docker compose restart` |

---

## 🔒 安全说明

- 部署服务器仅下发前端页面与甲骨文官方区域清单，不提供服务端代理 Ping 接口，彻底杜绝服务端被恶意利用扫描外部网络或触发云厂商发包风控警告。
- 零外部第三方前端统计脚本与冗余依赖，基于官方 `node:20-alpine` 极简镜像运行。
