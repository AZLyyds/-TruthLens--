# TruthLens 部署结构（Nginx + Node + MySQL）

## 生产拓扑
- `Nginx`：统一入口、HTTPS 终止、静态资源托管、`/api` 反向代理。
- `Node.js Backend`：业务服务层 + 智能体调度层接口。
- `MySQL`：新闻、评分结果、用户、历史、预警日志持久化。

## 目录与配置
- Nginx 配置模板：`deploy/nginx/truthlens.conf`
- 接口契约：`docs/openapi-v1.yaml`
- 前端映射：`docs/frontend-api-mapping.md`

## 建议运行方式
- Node 进程：`pm2` 或 `systemd` 托管（自动重启、日志收集）。
- 前端：CI 构建 `dist` 后 rsync 到 `/var/www/truthlens/dist`。
- MySQL：开启定时备份，按天保留 binlog。
