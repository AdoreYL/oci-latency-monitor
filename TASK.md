# TASK.md

## 背景

用户需要一套可通过 `docker-compose` 一键部署到云服务器、并通过反向代理（如宝塔、1Panel、Nginx Proxy Manager、Caddy）以域名访问的**甲骨文云 (OCI) 全球 40 个官方区域实时延迟与丢包监控网站**。

已确认的事实与当前仓库现状：
1. 架构与视觉方案已确认并记录于 `docs/superpowers/specs/2026-11-04-oci-latency-monitor-design.md`：采用 **Node.js 轻量后端 + 原生前端单容器方案**。
2. 仓库根目录目前存在早期纯静态原型文件（`index.html`、基于 `nginx:alpine` 的 `Dockerfile` 与映射 `8080:80` 的 `docker-compose.yml`），尚未包含后端测速服务、双模式切换、丢包率统计与历史延迟折线图功能，需在实施阶段重构迁移至前后端一体结构。

## 目标

- 实现支持**【🏠 本地浏览器测速】**与**【🖥️ 服务器后端测速】**一键切换的双模式甲骨文云全球 40 节点持续测速系统。
- 严格还原参考截图的经典 UI 布局（蓝紫渐变头部、状态进度条、4 个全局统计卡片、亚太/欧洲/美洲/中东非洲 2×2 双栏分区卡片）。
- 在每个节点行内新增**丢包率 (`丢包 X%`)** 与**行内实时迷你折线图 (Sparkline)**，并支持**点击节点展开查看详细历史延迟波动大图（最近 50 轮采样）**。
- 提供开箱即用的 `Dockerfile` 与 `docker-compose.yml`，确保反向代理环境下零跨域/混合内容报错。

## 范围与优先级

### P0（核心必做）

- **全球 40 节点数据源 (`src/regions.js`)**：涵盖亚太（10）、欧洲（11）、美洲（13）、中东与非洲（6）共 40 个甲骨文云官方区域及对应终端域名（`objectstorage.<region>.oraclecloud.com`）。
- **Node.js 后端服务 (`src/server.js`)**：
  - 托管 `public/` 静态页面。
  - 提供 `/api/health`、`/api/regions`、`/api/ping` 接口。
  - `/api/ping` 实现并发受控的 TCP 443 握手测速（兼顾可选 ICMP 探测），精准返回各节点连接耗时与超时状态，并严格执行节点 ID 白名单校验。
- **双模式前端与统计引擎 (`public/`)**：
  - 顶部提供【本地电脑测速】与【服务器容器测速】模式切换开关、开始/暂停、按延迟排序、重置统计、刷新间隔选择（2秒 / 3.5秒 / 5秒 / 10秒）。
  - 实时计算并展示每个节点的当前延迟、平均延迟、最低延迟、最高延迟、**丢包率 (%)**。
- **Docker Compose 容器化配置**：
  - 更新 `Dockerfile`（基于 `node:20-alpine`）与 `docker-compose.yml`（宿主机 `6689` 映射容器 `3000` 端口），内置健康检查。

### P1（重要增强）

- **行内迷你折线图 (Sparkline)**：在每个节点卡片内嵌 SVG 实时波动折线图，颜色随当前延迟等级动态变化（绿 `<150ms`、橙 `150~300ms`、红 `>300ms`）。
- **节点历史详情弹窗 (Detail Modal)**：点击任意节点行弹出放大版历史延迟折线图，展示最近 50 轮采样曲线、均值参考线、极值与丢包点。
- **官方新区域自动发现与同步 (`POST /api/regions/sync` + 定时同步)**：
  - 支持从甲骨文云官方开源 SDK（`oracle/oci-python-sdk` 的 `regions_definitions.py`）拉取最新商业云（`OC1` / `oraclecloud.com`）区域代码。
  - 自动按区域前缀（`ap-`、`eu-`/`uk-`、`us-`/`ca-`/`mx-`/`sa-`、`me-`/`il-`/`af-`）归类至四大洲。
  - 对新发现的区域执行 DNS 解析存活校验（验证 `objectstorage.<region>.oraclecloud.com` 是否已正式上线解析），通过后动态合并入白名单与前端列表；若网络离线或拉取失败，无缝回退至内置的 40 个官方节点保底。

### P2（体验细节）

- 移动端与窄屏自适应布局优化。
- 页面底部提供清晰的测速说明（代理直连提醒、连接预热说明、反向代理配置提示）。

## 已知文件与接口

- **现有文件/目录**：
  - 设计文档：`docs/superpowers/specs/2026-11-04-oci-latency-monitor-design.md`
  - 待迁移/更新的早期原型文件：`index.html`、`Dockerfile`、`docker-compose.yml`
- **目标文件/目录结构**：
  - `src/regions.js`：40 个甲骨文云区域定义与白名单校验函数
  - `src/server.js`：HTTP 静态服务与 `/api/*` 路由实现
  - `public/index.html`、`public/style.css`、`public/app.js`：前端视图与测速可视化逻辑
  - `test/server.test.js`：后端接口与安全白名单自动化测试
  - `Dockerfile`、`docker-compose.yml`：单容器构建与编排配置
- **API 接口约定**：
  - `GET /api/health` → `{ "status": "ok", "uptime": ... }`
  - `GET /api/regions` → 返回四大洲分组与当前生效的官方节点元数据（含内置节点与已同步的新区域）
  - `POST /api/regions/sync` → 触发从甲骨文官方 SDK 源同步最新商业区域并执行 DNS 存活校验，返回新增节点列表与当前总数
  - `GET /api/ping`（可选 `?id=<region_id>`）→ 返回单节点或全部生效节点的并发探测结果 `{ "timestamp": ..., "results": { "<id>": { "ok": true, "latency": 48, "method": "tcp" } } }`

## 实施要求

1. **第一阶段：后端核心与测试先行**
   - 编写 `src/regions.js` 与 `src/server.js`，实现静态文件托管、`/api/health`、`/api/regions` 及带并发限流与白名单校验的 `/api/ping`。
   - 编写并运行 `test/server.test.js`，验证 40 节点列表完整性、SSRF 非法节点拦截及测速响应格式。
2. **第二阶段：前端 UI 迁移与双模式+折线图实现**
   - 将根目录旧版 `index.html` 迁移整合至 `public/` 目录，清理根目录遗留的单文件静态原型。
   - 实现本地浏览器 Fetch Keep-Alive 测速与服务器 `/api/ping` 测速双模式无缝切换。
   - 在节点项中加入丢包率徽章、行内 SVG Sparkline 折线图及点击展开的 50 轮历史详情弹窗。
3. **第三阶段：Docker 容器化与端到端验证**
   - 更新 `Dockerfile` 与 `docker-compose.yml` 为 `node:20-alpine` 架构，验证本地启动与 API 调用。

## 明确不做

- 本次任务**不开发**用户自定义添加任意第三方 IP/端口的探测功能（防止公网反代下被滥用为扫描器）。
- **不引入** MySQL/Redis 等外部数据库组件，所有实时采样与历史统计均在内存与会话中高效完成。
- **不引入** Webpack/Vite 等复杂前端构建步骤。

## 安全与兼容约束

- 前端请求后端接口一律使用相对路径（`/api/...`），确保 HTTPS 反向代理下无 Mixed Content 或跨域问题。
- `/api/ping` 仅允许探测 `src/regions.js` 中预定义的 40 个甲骨文官方区域域名，任何不在白名单内的参数必须返回 `400 Bad Request`。
- 容器内不暴露敏感信息，单次探测超时控制在 `3000ms`（后端）/ `4000ms`（前端）以内。

## 验收标准

- [x] `node --test test/*.test.js` 全部通过（涵盖 40 节点数据校验、`/api/health`、`/api/regions`、`/api/ping` 正常测速与非法 `id` 拦截测试）。
- [x] 页面完整展示四大洲 40 个甲骨文云区域节点、顶部进度条、控制按钮组及 4 个全局概览统计卡片。
- [x] 顶部可正常切换【🏠 本地电脑测速】与【🖥️ 服务器容器测速】两种模式，切换后统计数据重新归零并按新模式正常更新。
- [x] 每个节点均正确显示：状态灯、地区名、域名、丢包率（`丢包 X%`）、当前延迟、行内迷你折线图（Sparkline）及平均/最低/最高延迟。
- [x] 点击任意节点可弹出历史延迟详情大图，展示最近采样波动曲线并在关闭或按 ESC 时正常收起。
- [x] 支持官方新区域同步（`POST /api/regions/sync` 及前端“同步官方节点”按钮），具备 DNS 存活校验与内置 40 节点离线兜底能力。
- [x] `Dockerfile` 与 `docker-compose.yml` 配置完成（宿主机 `6689` 映射容器 `3000`），待部署至目标 Docker 服务器实测启动。

## 验证命令或方式

- 单元测试：`node --test test/server.test.js`
- 本地服务与接口验证：启动 `node src/server.js` 后请求 `http://127.0.0.1:3000/api/health`、`http://127.0.0.1:3000/api/regions`、`http://127.0.0.1:3000/api/ping?id=ap-tokyo-1`
- 容器编排验证：`docker compose config` 与 `docker compose up -d --build`

## 交付要求

- 修改文件和功能摘要。
- 实际测试结果。
- 未完成项和风险。
- 是否允许提交、推送或发布：本轮及后续开发完成后，未经用户明确授权**禁止自动 git commit、push 或发布**。
