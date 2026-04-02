# TruthLens 联调验收清单

## 1. 登录链路
- [ ] `POST /api/v1/auth/login` 返回 token。
- [ ] 前端保存 token 后可进入 `/portal`。

## 2. 新闻流链路
- [ ] `GET /api/v1/news` 返回新闻列表。
- [ ] 门户页正常显示 `title/source/risk`。

## 3. 单篇分析链路
- [ ] 提交文本触发 `POST /api/v1/analysis/single`。
- [ ] 页面展示评分、结论、风险等级、维度分数。

## 4. 多篇一致性链路
- [ ] 提交两段文本触发 `POST /api/v1/analysis/multi`。
- [ ] 页面展示一致性分数、冲突点、建议。

## 5. 个人中心链路
- [ ] `GET /api/v1/profile/me` 返回用户信息与统计。
- [ ] `GET /api/v1/profile/history` 返回历史记录列表。

## 6. 跨域与网关
- [ ] 本地通过 Vite 代理访问 `/api` 无跨域报错。
- [ ] 生产经 Nginx 转发 `/api` 到 Node 正常。

## 7. 回退策略
- [ ] `VITE_USE_MOCK=true` 时页面可离线演示。
- [ ] `VITE_USE_MOCK=false` 时全部页面走真接口。
