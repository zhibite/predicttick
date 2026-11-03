# 纸盘交易模块（管理员）

纸盘模块用于验证 Polymarket Up/Down 短周期策略。它**只做模拟成交**，不使用私钥、
不签名、不向 CLOB 下真实订单；所有页面和 API 都要求管理员会话。

## 页面与 API

| 路径 | 说明 |
|---|---|
| `/admin/paper` | 策略列表、创建、启动/暂停、重置、删除 |
| `/admin/paper/[id]` | 权益曲线、配置、持仓、成交记录、结算记录 |
| `POST /api/admin/paper/tick` | 手动跑一次引擎 tick（调试） |

侧边栏 **Admin → Paper trading** 进入；普通用户不可见。

## 引擎

`src/server/paper/engine.ts` 在 Next 进程内运行，默认每 5 秒 tick 一次，
由 `src/instrumentation.ts` 启动：

- 只有存在 `active=1` 的策略时才读取行情库；无策略时是空转。
- 已暂停但仍有未结算持仓的策略也会继续 tick，以便结算和标记市值。
- 读取与采集器相同的 `samples` 1 秒快照（`up_bid/up_ask/up_mid/up_last` 等）。
- 行情库和业务库分离：行情用 `POLY_DB_PATH`，策略/交易记录用
  `POLY_APP_DB_PATH`。
- 结算依赖采集器回填的 `markets.resolved`（UP/DOWN）；市场结束后只在
  `resolved` 已知时结算。
- 权益点按分钟写入 `paper_equity`；同一分钟内多次 tick 只保留最后一条。

环境变量：

```bash
POLY_PAPER_ENGINE=1          # 0=关闭纸盘引擎
POLY_PAPER_TICK_SECONDS=5    # 2–60
```

## 策略类型

### 1. `pair_lock`：Up + Down 配对锁定

- 当 `up_ask + down_ask + fee/slippage < 1 - minEdge` 时，以当前 ask 同时买入
  Up 和 Down 相同股数。
- 持有到结算：赢的一边赎回 $1/股，输的一边归零。
- 目标利润 = `shares × (1 - 配对成本) - 费用`；不依赖 BTC 方向。
- 主要风险：两条腿未必都成交、盘口容量、结算延迟、平台规则变化。
- 回测/纸盘实现是**乐观成交**：默认假设两腿同时以 ask 成交，不模拟腿风险。

```json
{
  "pairNotional": 25,
  "minEdge": 0.01,
  "feeRate": 0,
  "slippageBps": 5,
  "maxCostPerMarket": 500,
  "maxOpenCost": 2000,
  "minSecondsBetweenEntries": 0,
  "maxSampleAgeSeconds": 10
}
```

### 2. `mid_maker`：低于 mid 的 maker 成交 + 持有到结算

这是根据目标账户归因结果设计的复刻策略：

- 在 Up/Down 两侧挂模拟 bid：`quote = min(bestBid, mid - minEdge)`。
- 只在新的一笔 last-trade 打印价 `<= quote` 时模拟成交（简化的排队模型）。
- 买入后持有到结算，不主动卖出；可选 `makerRebateBps` 返还。
- 价格过滤：默认只做 `0.30–0.90`，避开长尾和极端价。
- 时间窗口：默认只允许 `0-30s`、`1-2m`、`2-3m`、`4-5m`，避开目标账户
  markout 为负的 `30-60s` 和 `3-4m`。

```json
{
  "sizeUsd": 5,
  "minEdge": 0.005,
  "minPrice": 0.30,
  "maxPrice": 0.90,
  "feeRate": 0,
  "makerRebateBps": 45,
  "maxCostPerMarket": 50,
  "maxOpenCost": 600,
  "minSecondsBetweenEntries": 10,
  "maxSampleAgeSeconds": 10,
  "allowedWindows": ["0-30s", "1-2m", "2-3m", "4-5m"]
}
```

- `makerRebateBps: 45` 对应目标账户观测到的约 **0.45% 成交额返佣**
  （$22,361 / $4.97M）。实际返佣以 Polymarket 当前规则为准；保守回测可设为 0。
- `allowedWindows: []` 表示所有窗口。窗口标签只对 **5m** 市场生效；
  15m/1h/4h 市场当前按全时段评估。

## 数据表（app.sqlite，迁移 v8）

```sql
paper_strategies(id, name, kind, asset, period, config_json, active,
                 starting_balance, cash, realized_pnl, fees_paid,
                 last_tick_at, last_error, created_by, created_at, updated_at)

paper_positions(id, strategy_id, slug, asset, period, title, outcome,
                shares, cost, fees, avg_price, last_price, last_value,
                opened_at, updated_at, status, settled_at,
                settlement_price, realized_pnl,
                UNIQUE(strategy_id, slug, outcome))

paper_trades(id, strategy_id, slug, asset, period, title, outcome, side,
             price, shares, notional, fee, reason, signal_json, created_at)

paper_settlements(id, strategy_id, position_id, slug, title, outcome,
                  shares, payout, cost, fees, pnl, created_at)

paper_equity(strategy_id, ts, cash, positions_value, equity,
             realized_pnl, unrealized_pnl, PK(strategy_id, ts))
```

`fee` 为负数表示返佣；`fees_paid` 累计净费用（负数为净返佣）。
`paper_settlements.pnl = payout - cost - fees`。

## 目标账户（`0xcd30…2dd0`）策略归因

通过 v2 成交、已平仓、REDEEM 事件和本项目 1 秒盘口做的逆向分析：

| 观察 | 结果 |
|---|---|
| 全周期 | 576,447 笔成交，21,692 个市场，$4.97M 成交额 |
| 仓位 PnL | +$61,035（已实现 +$61,029，未实现 +$6） |
| 经济 PnL | +$83,466；maker 返佣 $22,361（26.8%），手续费 -$870 |
| 双边比例 | 91% 的市场同时买过 Up/Down；双边买入成交额 97% |
| 配对成本 | 加权 1.046，中位 1.026；仅 37.7% 的配对份额 <$1 |
| 退出 | 最近 5,000 条非成交活动：4,991 REDEEM，0 MERGE/SPLIT；几乎不主动卖 |
| 持仓 | 按市场窗口截断：中位 4.3 分钟（5m 市场）；FIFO 卖出样本仅 137 批 |
| 成交时点 | 0-30s 8.2%、30-60s 8.7%、1-2m 18.3%、2-3m 18.7%、3-4m 22.9%、4-5m 23.1% |
| 盘口优势 | 成交价平均低于当时 mid **0.57¢**；59.5% 的买入低于 mid |
| 短期漂移 | 成交后 1s -0.11¢、10s -0.13¢、60s -0.21¢（轻微逆向选择） |
| 到结算 | 相对成交时 mid 平均 **+1.42¢**；51.9% 为正 |
| 最佳区间 | 0-30s（到结算 +6.7¢）、2-3m（+6.8¢）；3-4m 为 **-3.9¢** |
| 最佳价格 | 0.50-0.90；<0.30 的长尾平均亏损 |

结论：**不是纯配对套利，也不是方向预测**。核心是：
1. 以 maker 方式在 mid 下方成交（价格改善）；
2. 承受 1-60 秒的轻微逆向选择；
3. 持有到 5 分钟结算，赚取“成交价 vs 最终赔率”的差价；
4. 用极高周转和 maker 返佣放大薄利。

`mid_maker` 纸盘策略就是按这四个特征建模的；`pair_lock` 是额外的机会型低风险
组件，但只占其配对份额的约 37.7%。

## 限制

- 纸盘不是回测：只从策略启动后开始记录，依赖采集器实时数据。
- maker 成交模型用“新 last-trade 打印价 <= 模拟 quote”近似，未模拟队列位置、
  撤单延迟和真实撮合；实际成交率可能不同。
- 没有建模 leg risk、gas、赎回延迟、预言机争议、平台/地区限制。
- 没有任何盈利保证；目标是验证正期望和风险，而不是承诺收益。
