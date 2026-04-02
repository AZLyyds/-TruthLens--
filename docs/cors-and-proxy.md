# TruthLens 跨域与代理方案

## 开发环境（推荐）
- 前端仅请求相对路径 `/api/*`。
- Vite 代理配置在 `vite.config.js`，将 `/api` 转发到 `http://127.0.0.1:3000`。
- 优点：浏览器同源，不需要在开发阶段频繁处理 CORS 细节。

## Node.js CORS 白名单样例（Express）
```js
import cors from 'cors'

const allowlist = [
  'http://localhost:5173',
  'https://truthlens.example.com',
]

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowlist.includes(origin)) return callback(null, true)
      return callback(new Error('CORS rejected'))
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    credentials: true,
    maxAge: 86400,
  }),
)
```

## 注意事项
- `credentials: true` 时，`Access-Control-Allow-Origin` 不能是 `*`。
- 建议记录拒绝来源，便于排查跨域配置错误。
- 生产环境统一走 Nginx 网关并使用 HTTPS。
