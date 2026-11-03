# 公共 API（P3）

## 创建 Key

登录后进入 `/account/api-keys`：

- Basic：最多 1 个 Key；Pro/管理员：最多 5 个
- Key 只在创建时显示一次，数据库只存 SHA-256 哈希
- Key 继承当前通行证；通行证到期后 API 返回 402
- 撤销立即生效

请求头二选一：

```http
Authorization: Bearer pk_live_...
X-API-Key: pk_live_...
```

## 限额

| 套餐 | Key 数 | 每分钟 | 每天 | 历史范围 |
|---|---|---|---|---|
| Basic | 1 | 60 | 10,000 | 365 天 |
| Pro | 5 | 300 | 100,000 | 730 天 |
| 管理员 | 5 | 300 | 100,000 | 730 天 |

- 响应头：`X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset`、`X-Plan`。
- 超限返回 429，带 `Retry-After`（每分钟）或 `DAILY_QUOTA_EXCEEDED`（每日）。
- 每日请求量记录在 `usage_daily` 和 `api_usage_daily`。

## 端点

| 方法 | 路径 | Scope | 说明 |
|---|---|---|---|
| GET | `/api/v1/health` | — | 健康检查 |
| GET | `/api/v1/meta` | — | 公开数据概览（按 IP 限流） |
| GET | `/api/v1/me` | data:read | 当前 Key、套餐、限额、用量 |
| GET | `/api/v1/markets` | data:read | 市场窗口列表 |
| GET | `/api/v1/markets/{slug}` | data:read | 单窗口详情 |
| GET | `/api/v1/markets/{slug}/samples` | data:read | 单窗口样本 |
| GET | `/api/v1/candles` | data:read | 跨窗口 OHLC |
| GET | `/api/v1/coverage` | data:read | 按天覆盖情况 |
| GET | `/api/v1/export` | export:read | 直接 CSV 流 |
| GET/POST | `/api/v1/exports` | export:read | 列出/创建后台导出 |
| GET | `/api/v1/exports/{id}` | export:read | 任务状态 |
| GET | `/api/v1/exports/{id}/file` | export:read | 下载文件（支持 Range） |
| GET | `/api/v1/openapi.json` | — | OpenAPI 3.1 |
| GET | `/api/docs` | — | 英文文档页 |

## 分页

- `limit` 默认/上限：markets 100/500；samples 1000/1000；candles 500/5000。
- 使用不透明 `cursor`；响应里有 `pagination.nextCursor`、`hasMore`。
- 不要用 offset；数据会持续增长。

## 日期与时间

- 日期参数 `from` / `to` 使用 UTC 的 `YYYY-MM-DD`。
- 响应同时给 epoch 秒和 ISO 8601 字符串。
- Candles 单次最多 31 天，避免一次请求扫描过多样本。

## 错误格式

```json
{
  "error": {
    "code": "HISTORY_LIMIT",
    "message": "Your plan can access data from 2025-11-02 onward.",
    "requestId": "..."
  }
}
```

- 400 参数错误；401 Key 无效/缺失；402 通行证过期；403 权限/历史范围；404 不存在；413 直接导出过大；429 限流/配额。

## CORS

`POLY_API_CORS_ORIGINS` 支持逗号分隔的来源或 `*`。响应会带
`Access-Control-Allow-Headers`、`Access-Control-Expose-Headers`。

## 与站内接口的区别

- `/api/v1/*` 是公共、带 Key、分页、可限流的接口。
- `/api/meta|windows|klines` 是站内页面接口，仅供 `/markets` 免费浏览使用，匿名只允许近期数据。
- 站内下载使用会话 Cookie；外部下载使用 API Key。

## 当前限制

- 限流器在内存中，单实例有效；多实例需要 Redis/DB 共享计数。
- `candles` 是请求内聚合，不落聚合表；大范围建议用导出。
- API Key 目前是账户级全权限（data:read + export:read），后续可加更细 scope。
- 未实现 API 用量页面（只有 `/api/v1/me` 和数据库表）。
