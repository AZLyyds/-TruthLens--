# TruthLens 前端 API 对接映射

## 配置开关
- `.env` 使用 `VITE_USE_MOCK=true|false` 控制是否回退 mock。
- 基础地址由 `VITE_API_BASE_URL` 控制，默认 `/api/v1`。

## 页面与接口映射
- `LoginView`:
  - 调用：`POST /auth/login`
  - 入参：`{ username, password }`
  - 出参：`{ accessToken, refreshToken, username }`
  - 行为：保存 token 到 `localStorage`，跳转 `/portal`
- `NewsPortalView`:
  - 调用：`GET /news?page=1&pageSize=20`
  - 字段映射：`id/title/source/risk` -> 卡片渲染
- `NewsAnalysisView`:
  - 调用：`POST /analysis/single`
  - 入参：`{ text }`
  - 字段映射：`credibilityScore/verdict/riskLevel/reasons/suggestions/dimensions`
- `MultiAnalysisView`:
  - 调用：`POST /analysis/multi`
  - 入参：`{ items: [{ text }, { text }] }`
  - 字段映射：`consistencyScore/conflicts/sourceAuthorityDiff/recommendation`
- `ProfileView`:
  - 调用：`GET /profile/me`、`GET /profile/history`、`PUT /profile/me`（用户名 / 邮箱 / 头像 URL / 改密）、`POST /profile/me/avatar`（`multipart/form-data` 字段名 `file`）
  - 字段映射：`userId/username/email/avatarUrl/preferences/stats` 与历史列表；头像静态资源开发环境经 Vite 代理 `/uploads` → 后端

## 错误与鉴权处理
- 统一拦截器在 `src/api/http.js` 处理：
  - 读取 token 并注入 `Authorization`
  - 非 `code === 0` 作为业务错误抛出
  - `401` 时清理 token
