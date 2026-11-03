# Polymarket 交易者排行榜

排行榜是**手工维护**的：管理员在后台收集 Polymarket 钱包地址并添加，服务端
定期从 Polymarket 公共 Data / Gamma API 拉取该地址的公开交易数据，计算指标后
在 `/leaderboard` 展示，并在详情页给出交易行为分析。

不需要 Polymarket API Key、私钥或钱包签名。

## 页面

| 路径 | 访问 | 说明 |
|---|---|---|
| `/leaderboard` | 公开 | 排行榜列表；按 PnL / 成交量 / 胜率 / ROI / 交易数 / 持仓市值排序 |
| `/leaderboard/[address]` | 公开 | 单个交易者分析页；`active=0` 时仅管理员可看 |
| `/admin/leaderboard` | 管理员 | 地址管理：添加、同步、编辑标签/备注、隐藏、删除 |

标签（label）会作为公开榜单上的显示名；备注（notes）仅管理员可见。

侧边栏的 **Leaderboard** 是公开入口；管理员登录后侧边栏额外显示 **Admin**
分组，包含 **Leaderboard addresses**。

## 后台 API

| 路径 | 方法 | 说明 |
|---|---|---|
| `/api/admin/leaderboard/users` | `GET` | 列出全部地址（含隐藏） |
| `/api/admin/leaderboard/users` | `POST` | 添加地址并立即同步一次 |
| `/api/admin/leaderboard/users/[id]` | `PATCH` | 修改标签、备注、可见性、排序权重 |
| `/api/admin/leaderboard/users/[id]` | `DELETE` | 删除地址及其缓存数据 |
| `/api/admin/leaderboard/sync` | `POST` | `{"id":"..."}` 同步单个；`{"all":true}` 同步全部 |

所有写操作都要求管理员会话并通过同源检查；变更写入 `audit_log`。

## 数据来源

Polymarket 已于 2026 年下线 Data API v1，本项目使用 **Data API v2**
（`https://data-api.polymarket.com/v2`）。v2 使用 snake_case 字段和
cursor 分页，单页上限 1000 条。

| 数据 | Polymarket 接口 |
|---|---|
| 公开资料（昵称、简介、头像） | `GET https://gamma-api.polymarket.com/public-profile?address=` |
| 当前持仓 | `GET /v2/positions?user=&status=OPEN&include_archived=false` |
| 已平仓记录（已实现 PnL） | `GET /v2/positions?user=&status=CLOSED&sort_by=TIMESTAMP&sort_direction=DESC` |
| 近期成交 | `GET /v2/activity?user=&type=TRADE&sort_by=TIMESTAMP` |
| 持仓总市值 | `GET /v2/value?user=` |
| 全周期统计 | `GET /v2/user-stats?user=` |
| 全周期排行榜名次 | `GET /v2/leaderboard?user=&time_period=all&sort_by=PNL` |
| 全周期 PnL 日线（分析脚本/reporting） | `GET /v2/user-pnl?user=&interval=all&fidelity=1d` |

- 持仓最多取 1000 条，已平仓记录最多 500 条，成交最多 1000 条
  （可通过环境变量放宽；所有分页都沿 `next_cursor` 走到上限）。
- 已平仓记录按 `last_event_at` 倒序取最近样本；每条记录一个 token
  (`token_id`)。
- 成交记录同时用于成交量、买卖占比、按小时活跃度、交易额分布、FIFO 持仓时长
  和 Top markets。
- 已平仓记录带 `first_entry_at` / `last_event_at`。对于 slug 中带窗口起点的
  5m/15m/1h/4h 市场，持仓时长会截断到市场结算时间，避免赎回延迟把持仓时长
  拉长。
- 接口字段解析是防御式的：Gamma 资料接口 404 时退回成交记录里带的昵称/头像；
  某个接口临时失败不会清空其他已同步数据。

## 指标口径

| 指标 | 计算方式 |
|---|---|
| 全周期 PnL | `/v2/user-stats` 的 `position_pnl`（realized + unrealized） |
| 全周期经济 PnL | `position_pnl + maker/taker 返佣`，对应 `economic_pnl` |
| 全周期成交量/笔数/市场数 | `/v2/user-stats` 的 `volume_usdc`、`trade_count`、`trades`（distinct markets） |
| 全周期排名 | `/v2/leaderboard?user=` 的 `rank_pnl` / `rank_volume` |
| 样本 PnL | 已平仓 `realized_pnl` 合计 + 当前持仓 `unrealized_pnl` |
| 胜率 | 已平仓样本中 `realized_pnl > 0` 的占比；不计 0 |
| ROI | 已平仓样本 `realized_pnl / Σ(total_size × avg_price)`；`total_size` 是股数，不是美元 |
| Profit factor | 已平仓样本总盈利 / 总亏损；没有亏损时显示 “No losses” |
| 最大回撤 | 已平仓样本按平仓时间累计 PnL 的峰值回撤（USD） |
| 样本成交量 | 拉取到的成交 `usdc_size` 之和（缺少时用 `size × price`） |
| 买卖占比 | BUY / SELL 的成交额和笔数 |
| 持仓时长 | 已平仓记录 `first_entry_at → last_event_at`，并按 slug 中的市场窗口截断；另保留 FIFO 主动卖出往返作为补充 |
| Top markets | 按样本成交额排序，合并该市场的已实现 PnL 和持仓市值 |
| 当前连胜/连败 | 按平仓时间排序后尾部连续盈利/亏损的次数 |

**注意**：全周期 PnL/成交量/笔数/市场数来自 v2 user-stats；胜率、ROI、回撤、
小时分布、持仓时长和 Top markets 仍基于最近拉取的样本（默认 500 条已平仓 +
1000 笔成交），页面会标注来源和样本条数。

## 同步

- 添加地址时立即同步一次（请求内完成）。
- 服务启动后由 `instrumentation.ts` 启动后台同步器：
  - 默认每 `POLY_LEADERBOARD_SYNC_MINUTES=30` 分钟刷新一次；
  - 只刷新 `active=1` 且到期的地址；
  - 并发 2，逐批处理，避免打满小机器和上游限流；
  - 设置 `POLY_LEADERBOARD_SYNC=0` 可关闭后台同步（仍可用后台按钮手动同步）。
- 同步状态保存在 `leaderboard_users.sync_status`：
  `pending` / `syncing` / `ok` / `error`。部分接口失败但其它接口成功时状态仍为
  `ok`，失败详情写入 `last_sync_warning`。

## 数据表（业务库 app.sqlite）

```sql
leaderboard_users(
  id PK, address UNIQUE, label, notes, active, sort_priority,
  profile_name, profile_pseudonym, profile_bio, profile_image, profile_json,
  metrics_json, last_synced_at, last_sync_error, last_sync_warning,
  sync_status, created_at, updated_at
)

leaderboard_positions(address, asset, ..., updated_at, PK(address, asset))
leaderboard_closed_positions(address, asset, ..., first_entry_at, closed_at,
                             PK(address, asset))
leaderboard_activity(address, id, timestamp, side, size, price, usdc_size, ...,
                     PK(address, id))
```

`metrics_json` 缓存聚合指标（包含全周期统计和排名），列表页直接读取；详情页
从明细表重建 PnL 曲线、每日成交额、Top markets 和持仓时长。删除地址会级联
删除三张明细表的缓存。

迁移版本为 `schema_migrations.version = 7`，服务启动时自动创建/升级。

## 环境变量

```bash
POLY_LEADERBOARD_SYNC=1                 # 0=关闭后台定时同步
POLY_LEADERBOARD_SYNC_MINUTES=30        # 5–1440
POLY_LEADERBOARD_MAX_POSITIONS=1000     # 持仓分页上限
POLY_LEADERBOARD_MAX_CLOSED=500         # 已平仓记录上限
POLY_LEADERBOARD_MAX_TRADES=1000        # 成交记录上限
# POLY_DATA_API_URL=https://data-api.polymarket.com/v2
# POLY_GAMMA_API_URL=https://gamma-api.polymarket.com
```

`POLY_DATA_API_URL` 可以写主机根路径或带 `/v2` 的完整前缀；代码会自动补
`/v2`。v1 已下线，不要指向 v1。

本地开发无法直连 Polymarket 时，后台仍可添加地址，但同步会显示失败；部署到
EC2 后由后台 **Sync all** 或定时任务补齐。

## 使用流程

1. 从 Polymarket 个人主页 URL（`polymarket.com/profile/0x...`）或官方排行榜
   收集代理钱包地址。
2. 打开 `/admin/leaderboard`，粘贴地址（也接受整条个人主页 URL，会自动提取
   `0x…`）、填写可选标签/备注，点击 **Add and sync**。
3. 同步完成后可查看 PnL、成交量、胜率和最后的同步时间；失败时行内会显示原因。
4. 用 **Visible / Hidden** 控制是否出现在公开榜单；**Remove** 会删除缓存数据。
5. 公开榜单在 `/leaderboard`，详情页包含 PnL 曲线、每日成交、买卖结构、UTC
   活跃时段、交易额分布、Top markets、持仓/平仓/成交明细。
