# TruthLens

面向国际涉华信息的**可信度分析**与**风险预警**演示平台：支持新闻浏览、单篇/多篇分析、个人中心与历史记录；后端提供 REST API、MySQL 持久化。**新闻采集**将对接统一的数据流水线（规划接入阿里云百炼等 API），当前版本不依赖第三方新闻聚合服务即可本地跑通。

## 技术栈

- **前端**：Vue 3、Vue Router、Vite、Axios  
- **后端**：Node.js（Express）、MySQL、bcrypt 密码哈希  
- **AI / 流水线**：大模型事实抽取与评分（持续对接百炼流水线）；采集侧由独立流水线写入 `news` 表

## 目标数据流（与申报书一致）

1. 用户端 / 边缘端发起分析请求  
2. 智能体统一接收并调度全流程（后续由流水线 + 调度服务承载）  
3. 数据采集服务拉取新闻（**由百炼流水线或自建编排替代**，不落在本仓库的演示 NewsAPI 路径）  
4. AI 能力层做事实抽取与文本处理  
5. 可信度评估服务做比对与评分（FakeScore 等）  
6. 结果写入 MySQL  
7. 推送到用户端、监控大屏、树莓派边缘端（推送层可渐进实现）

## 功能概览

| 模块 | 说明 |
|------|------|
| 用户 | 注册、登录（种子演示账号见下文） |
| 新闻 | 列表与详情；数据入库存 `news`（演示可用 `POST /api/v1/news`，正式数据由后续流水线灌库） |
| 分析 | 单篇可信度评估、多篇一致性对比；结果可写入 `analysis_records` |
| 个人中心 | 偏好、统计、历史记录（来自数据库） |
| 运维接口 | 健康检查、采集流水线手动触发等 |

## 克隆后如何启动（推荐给协作者）

### 环境要求

- Node.js 18+（推荐 LTS）
- MySQL 5.7+ / 8.x，并已创建空数据库（例如库名 `truthlens`）

### 1. 安装依赖

```bash
git clone <你的仓库地址> TruthLens
cd TruthLens
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少配置 MySQL：

- `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`

前端联调真实接口时保持：

- `VITE_USE_MOCK=false`
- `VITE_API_BASE_URL=/api/v1`（开发时 Vite 会把 `/api` 代理到后端，见 `vite.config.js`）

本地若没有流水线，可先调用 `POST /api/v1/news` 写入几条新闻，或执行一次性的数据导入脚本，门户页即可有列表数据。

### 3. 准备数据库

在 MySQL 中执行（库名与 `.env` 中 `MYSQL_DATABASE` 一致）：

```sql
CREATE DATABASE IF NOT EXISTS truthlens CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

启动后端时会根据 `backend/sql/schema.sql` 的定义**自动建表**

### 4. 启动后端

```bash
npm run dev:backend
```

默认监听：`http://127.0.0.1:3000`  
健康检查：`GET http://127.0.0.1:3000/api/v1/healthz`

### 5. 启动前端（另开一个终端）

```bash
npm run dev
```

浏览器打开终端里提示的本地地址（常见为 `http://localhost:5173`，端口以实际输出为准）。

### 6. 演示登录账号

当数据库中**没有任何用户**时，后端首次启动会自动插入一条演示用户：

- **用户名**：`demo`  
- **密码**：`demo123`

登录页在未填密码时会使用默认密码 `demo123`（仅方便本地演示）。  

**若库里已是旧演示账号 `jiwei`**：后端启动时会自动改为 `demo` 并重置密码为 `demo123`。其它情况：可 `POST /api/v1/auth/register` 注册新账号，或清空 `users` 后重启以重新种子 `demo`。

### 7. 一键脚本（可选）

仓库内 `npm run dev:full` 会在后台启动后端再启动前端；在部分环境下后台任务行为因 shell 而异，**更稳妥的方式仍是两个终端分别执行** `dev:backend` 与 `dev`。

## 关于采集代码（NewsAPI，默认关闭）

仓库中仍保留 **`backend/src/newsPipeline.js`** 里的 NewsAPI 样例实现，便于对照「拉取 → 清洗 → 去重 → 入库」的步骤；**默认不在启动时运行**（`NEWS_COLLECT_ENABLED=false`）。正式路线请改为调用**百炼流水线 API**（或其它编排），将结构化新闻写入 `news` 表即可与现有 REST 无缝对接。若暂时不用，可忽略 `.env` 里以 `NEWS_API_` 开头的变量。

## 常见问题（CORS / 跨机访问）

开发环境下，后端允许 `http://localhost:任意端口` 与 `http://127.0.0.1:任意端口` 来源。若前端与后端不在同一台机器，请把前端访问后端的地址改为可达 IP，并在后端配置 `CORS_ALLOWLIST`（逗号分隔多个 Origin）。

## 目录提示

- `src/`：Vue 前端页面与 API 封装  
- `backend/src/`：Express 入口与服务逻辑  
- `backend/sql/schema.sql`：表结构参考（与启动时自动建表一致）

## 许可证

以仓库内 `LICENSE` 为准（若未添加则由项目维护者补充）。
