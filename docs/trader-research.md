# 目标交易者归因 ETL（管理员）

`/admin/research` 用于把一个 Polymarket 钱包的公开成交，与本站采集的
1 秒 Up/Down 盘口对齐，生成可复现的策略归因数据。它只读数据、不下单，
所有页面/API 都要求管理员会话。

## 工作流

```text
录入地址 + 最大成交数
        ↓
后台 worker：分页拉取 /v2/activity?type=TRADE
        ↓
trader_research_trades（原始成交）
        ↓
按 slug 读取 1 秒 samples + market start/end/resolved
        ↓
写入 entry edge、+1s/+10s/+60s/settlement markout、时间窗口、价格带
        ↓
汇总：按窗口/价格/结果的 markout、配对成本、时序分布、返佣、
      全周期 user-stats 和排行榜名次
        ↓
/admin/research/[id] 查看
```

- 默认最多 **20,000** 笔成交；`0` 表示一直翻页到 API cursor 耗尽。
- 目标地址全周期约 **576k** 笔成交；全量运行需要较长时间和较大
  `app.sqlite`，建议先用 20k 做第一轮，再按需放大。
- worker 在 Web 进程内运行，分批 yield，避免长时间阻塞请求；服务重启时
  `FETCHING/ENRICHING` 会标记为 ERROR，需要重新发起。
- 环境变量：`POLY_RESEARCH_ENGINE=0` 可关闭 worker。

## 指标口径

对每笔 BUY（SELL 取反）：

| 指标 | 定义 |
|---|---|
| `entry_edge` | 成交时 mid − 成交价；>0 表示买在 mid 下方 |
| `markout_1s/10s/60s` | t+h 的 mid − 成交时 mid |
| `markout_end` | 市场结束时的 mid − 成交时 mid（截断到市场窗口） |
| `elapsed` | 成交时间 − 市场 start_epoch |
| `window` | 0-30s / 30-60s / 1-2m / 2-3m / 3-4m / 4-5m / 5m+ |
| `price_bucket` | `<0.10` … `>=0.90` |
| pair cost | 同一 condition 的 Up 均价 + Down 均价 |
| two-sided | 同时买过 Up 和 Down 的市场占比 |
| locked profit est. | `min(upShares,downShares) × max(0, 1 - upAvg - downAvg)` 之和 |

## 数据表（app.sqlite，迁移 v9）

```sql
trader_research_runs(
  id PK, address, status, max_trades, created_by,
  created_at, started_at, finished_at,
  progress_trades, enriched_trades, total_expected,
  truncated, error, summary_json
)

trader_research_trades(
  run_id, id, slug, title, condition_id, outcome, side,
  price, size, usdc_size, trade_ts,
  market_start, market_end, resolved, elapsed,
  mid_at_fill, mid_1s, mid_10s, mid_60s, mid_end,
  entry_edge, markout_1s, markout_10s, markout_60s, markout_end,
  PRIMARY KEY(run_id, id)
) WITHOUT ROWID
```

## 页面与 API

| 路径 | 说明 |
|---|---|
| `/admin/research` | 发起/查看归因任务 |
| `/admin/research/[id]` | 汇总、按窗口/价格/结果 markout、配对结构、逐笔明细 |
| `GET/POST /api/admin/research/runs` | 任务列表 / 创建 |
| `GET/DELETE /api/admin/research/runs/[id]` | 详情 / 删除 |

## 纸盘逐笔 markout

纸盘 `paper_trades` 也会写入同一组字段（迁移 v9）：

- `mid_at_fill`、`mid_1s`、`mid_10s`、`mid_60s`、`mid_end`
- `entry_edge`、`markout_1s`、`markout_10s`、`markout_60s`、`markout_end`
- `markout_status`（PENDING/PARTIAL/COMPLETE）和 `markout_updated_at`

`/admin/paper/[id]` 的 **Execution quality / markout** 面板按当前展示的
成交计算平均值与为正比例；逐笔表格也展示 entry edge 和各期 markout。

纸盘 markout 由 `src/server/paper/markout.ts` 在每次引擎 tick 中补齐：
- entry mid 取成交时间最近的前/后 1 秒样本（容差 10 秒）
- 1s/10s/60s 取目标时间之后最近样本（容差 10 秒）
- 结算 mid 取市场 end_epoch 之前 15 秒内的样本；缺失则留空
- 市场结束 10 分钟后仍未补齐则标记 COMPLETE，避免永久 PENDING

## 当前目标账户的已知结论

`0xcd30457c790d8b35a08bcf3f894ad6bb52bc2dd0`：

- 全周期 576,447 笔成交 / 21,692 个市场 / $4.97M 成交额
- 仓位 PnL +$61,035；经济 PnL +$83,466；maker 返佣 $22,361（26.8%）
- 平均 entry edge +0.57¢；59.5% 的买入低于 mid
- 成交后 1s/10s/60s：-0.11¢ / -0.13¢ / -0.21¢（轻微逆向选择）
- 到结算：+1.42¢；51.9% 为正
- 0-30s 和 2-3m 最好；30-60s 和 3-4m 最差
- 0.50–0.90 价格带最好；<0.30 长尾平均亏损
- 91% 市场双边买入，但加权配对成本 1.046；只有 37.7% 配对份额 <$1
- 最近 5,000 条非成交活动中 4,991 REDEEM、0 MERGE/SPLIT：持有到结算
- 按市场窗口截断后持仓中位数 4.3 分钟

## 限制

- 只能看到公开成交，看不到目标账户的挂单、撤单、队列位置和真实延迟；
  因此只能做“行为等价”复刻，不能 100% 还原原始策略。
- 样本/全量成交的 markout 依赖本站采集器覆盖的时间段；没有对应 slug/样本
  的成交会保留为空。
- 长尾价格、极端波动和赎回延迟会影响样本；请结合全周期 user-stats 和
  纸盘前向结果交叉验证。
