# AGENTS.md

## 项目概览

- **项目名称**：甲骨文云 (OCI) 全球节点实时延迟与丢包监控系统 (`oci-latency-monitor`)
- **目标**：提供可通过 `docker compose` 一键部署并兼容各类反向代理（HTTPS 域名）访问的甲骨文云全球 40 个官方区域实时网络延迟、丢包率与波动趋势监控工具。
- **技术栈**：
  - 后端：Node.js 20 (`node:20-alpine`)，优先使用 Node.js 标准库（`http`、`https`、`net`、`dns`、`fs`、`path`、`node:test`），保持零冗余外部依赖或极简依赖。
  - 前端：原生 HTML5 + CSS3 + Vanilla JavaScript（含原生 SVG/Canvas 折线图渲染，无前端构建打包链路）。
  - 部署与容器化：Docker + Docker Compose 单容器同源托管前后端。
- **主要目录**：
  - `src/`：后端服务入口（`server.js`）与甲骨文全球区域节点配置（`regions.js`）
  - `public/`：前端静态资源（`index.html`、`style.css`、`app.js`）
  - `test/`：后端 API、白名单安全校验与节点完整性测试
  - `docs/superpowers/specs/`：架构与功能设计文档（Spec）

## 长期有效规则

- **代码风格与架构约定**：
  - 前后端同源托管于同一端口，所有前端请求后端 API 必须使用相对路径（如 `/api/regions`、`/api/ping`），严禁硬编码 `localhost`、固定 IP 或 `http://` 协议头，确保在 Nginx / 宝塔 / 1Panel / Nginx Proxy Manager / Caddy 等 HTTPS 反向代理下零配置正常工作。
  - 并发探测必须设有限流与超时保护（单节点探测超时不超过 `4000ms`），上一轮探测完成后再调度下一轮，防止弱网环境下连接堆积。
- **优先复用的模块/依赖**：
  - 优先使用 Node.js 内置标准库（`node:http`、`node:net`、`node:test`）和浏览器原生 API（`fetch`、`AbortController`、`performance.now`、SVG/Canvas）。
- **禁止引入或修改的内容**：
  - 禁止引入重量级前端打包框架或外部 CDN 统计脚本，确保内网/反代环境独立可用。
  - 禁止向客户端暴露宿主机敏感环境变量或系统内部路径。

## Git 与外部操作边界

- **禁止操作**：严禁执行 `git push --force`、`git reset --hard`、跳过 hooks 或未经确认删除用户已有数据文件。
- **提交/推送/发布确认要求**：所有 Git 提交、远程仓库推送、镜像发布及破坏性文件删除操作，必须先用简体中文向用户说明影响并取得明确授权。

## 数据与安全

- **密钥和配置处理规则**：不得在代码、配置文件或文档中写入任何密钥、Token、密码、私人服务器 IP 或个人隐私数据。
- **SSRF 防护约束**：后端测速接口（`/api/ping`）必须严格校验目标节点 ID 是否存在于内置的甲骨文云官方区域白名单（`OCI_REGIONS`）中，严禁接受客户端传入的任意 IP、域名或端口进行网络探测。
- **破坏性操作的备份与确认要求**：覆盖或清理旧版原型文件前，需核对文件用途并在任务执行中保留可回退路径或取得用户确认。

## 构建与验证

- **单元测试**：`node --test test/*.test.js`
- **本地运行**：`node src/server.js`（默认监听 `3000` 端口）
- **Docker 构建与启动**：`docker compose up -d --build`（默认宿主机映射 `6689:3000`）
- **健康检查**：`curl http://localhost:6689/api/health`（容器内部为 `http://127.0.0.1:3000/api/health`）

## 完成标准

- 修改完全满足 `TASK.md` 中的验收条件。
- 相关单元测试、接口检查与容器构建已实际运行并如实报告结果。
- 未验证项、外部环境限制（如本地代理或宿主机防火墙影响）和风险明确列出。
- 不把一次性任务要求写回本文件。
