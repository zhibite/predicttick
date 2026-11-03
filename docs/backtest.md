# 回测（P4）

## 权限与配额

| 套餐 | 次数/天 | 单次范围 | 保存策略 | 结果保留 | 并发 |
|---|---|---|---|---|---|
| Free | 3 次一次性试用 | 7 天 | — | 7 天 | 1 |
| Basic | 50 | 90 天 | 50 | 30 天 | 1 |
| Pro | 500 | 730 天 | 500 | 180 天 | 2 |
| 管理员 | 500 | 730 天 | 500 | 180 天 | 2 |

- Free 只能用内置示例，不能保存自定义策略。
- 历史范围同时受套餐历史限制。
- 窗口数量上限：Basic 30 万，Pro/管理员 200 万。
- 单次运行时间上限：Basic/Free 120 秒，Pro/管理员 300 秒。

## 策略格式

单文件 JavaScript，不使用 `require`/`import`/网络/文件系统。

```js
const meta = { mode: "point", decisionBeforeEnd: 60 };
const params = { maxAsk: 0.92, stake: 10 };

function onWindow(ctx) {
  const s = ctx.latest;
  if (!s) return null;
  const side = s.up.mid >= s.down.mid ? "UP" : "DOWN";
  const book = side === "UP" ? s.up : s.down;
  if (book.ask == null || book.ask > ctx.params.maxAsk) return null;
  return { action: "enter", side, stake: ctx.params.stake };
}
```

`stream` 模式：

```js
const meta = { mode: "stream" };
function onSample(ctx, sample) {
  if (!ctx.position) {
    if (sample.up.ask != null && sample.up.ask <= 0.55) {
      return { action: "enter", side: "UP", stake: 10 };
    }
    return null;
  }
  if (sample.up.bid != null && sample.up.bid >= 0.90) {
    return { action: "exit" };
  }
  return null;
}
```

- `ctx.market`：`{ slug, asset, period, start, end }`，不含结算结果。
- `ctx.params`：默认 params 合并运行参数。
- `ctx.latest` / `ctx.samples`：point 模式只包含决策时点及之前的数据。
- `ctx.position`：stream 模式当前持仓。
- 返回 `{ action: "enter", side: "UP"|"DOWN", stake, limitPrice? }` 或 `{ action: "exit" }`。
- 一个窗口最多一笔持仓；stream 退出后不能重新入场。

## 执行模型

- 入场：`ask * (1 + slippageBps/10000)`，可选 limit price。
- 出场：`bid * (1 - slippageBps/10000)`。
- 未提前出场：赢家每股 1，输家 0。
- 手续费按 bps 从出场/结算收入中扣除。
- 盘口无效、超出 limit、样本不足、未结算窗口会跳过并计数。
- 不做部分成交、不做成交量冲击；不模拟限价单挂单。

## 指标

win rate、PnL、ROI、profit factor、max drawdown、Sharpe、Brier、edge、平均入场价、校准分桶、按币种/周期/日拆分、skipped 分类、equity curve。

## 沙箱

- QuickJS WASM，内存上限 32 MB，单窗口 50 ms，整次运行受套餐时间上限约束。
- 无网络、无文件、无进程、无宿主函数。
- 顶层代码和每窗口调用都有中断处理；死循环会失败而不是挂住服务。
- 策略源码 64 KB，参数 16 KB。
- `Date` 被移除，`Math.random` 固定为 0.5，保证可复现。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET/POST | `/api/backtest/strategies` | 列出/保存策略 |
| GET/PUT/DELETE | `/api/backtest/strategies/{id}` | 读取/更新/归档 |
| GET/POST | `/api/backtest/runs` | 列出/创建回测 |
| GET | `/api/backtest/runs/{id}` | 结果和交易明细 |
| POST | `/api/backtest/runs/{id}/cancel` | 取消排队中的回测 |

创建 run 的 body 示例：

```json
{
  "asset": "btc",
  "period": "5m",
  "from": "2026-10-01",
  "to": "2026-10-30",
  "resolvedOnly": true,
  "stake": 10,
  "slippageBps": 0,
  "feeBps": 0,
  "params": { "stake": 10 },
  "source": "const meta = ..."
}
```

## 当前限制

- 回测 worker 运行在 Next 进程内，一次一个；P5 应拆成独立 jobs 服务。
- 结果页有累计 PnL 与回撤图表，图表数据表保留在 `<details>` 中。
- 策略保存和创建 run 时会做 V8 编译级语法预检；QuickJS 运行时错误仍在任务里显示。
- 取消仅支持 queued 状态，运行中的任务不能中断（沙箱有时间上限）。
- 尚未实现策略市场/公开分享。
