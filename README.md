# Polymarket Up/Down Monitor

基于 [PredictTick](README.tailadmin.md) (Next.js + TailAdmin 模板) 改造的
Polymarket 5m / 15m 历史 K 线监控。数据来自 gmgndata 工程的 SQLite 数据库。

## 支持币种

BTC · ETH · BNB · SOL · DOGE · XRP · HYPE

每个币展示 5 分钟和 15 分钟两种周期窗口，按时间倒序排列。

## 启动

```bash
npm install
npm run dev
# 设置环境变量（可选，默认指向 8.gmgndata 的 data 目录）：
# set GMGN_DATA_DIR=D:\05.project2\10.polymarket\8.gmgndata\data
```

打开 http://localhost:3000 即可。

## 数据源

通过环境变量 `GMGN_DATA_DIR` 指定 SQLite 数据库目录（默认 `D:\05.project2\10.polymarket\8.gmgndata\data`）。

读取以下文件：
- `markets.db` — 市场元数据
- `{asset}.db` — 每币的 kline（兼容 `btc_2026.db` 等按年分库形式）
- 自动发现同一资产的所有 `.db`，按文件名排序后合并查询

## API

| 路由 | 说明 |
|---|---|
| `GET /api/polymarkets/health` | 数据源健康检查 + 每个资产 db 体积 |
| `GET /api/polymarkets/assets` | 各资产窗口统计 |
| `GET /api/polymarkets/markets?asset=&period=` | 市场列表（不含 kline） |
| `GET /api/polymarkets/markets/[asset]/[period]?limit=&offset=` | 分页市场 + 附带 kline |

## 数据规模与分库策略

按当前 ~46 GB / 7 币 / 4.5 个月 ≈ **10 GB/月**。
- 单库超过 15 GB 时控制台会发警告
- 单库超过 25 GB 时查询自动加 LIMIT 兜底
- 建议在每年初执行 `btc_2026.db → btc_2027.db` 拆分，读取层已支持多文件 union

## 图表

- **Line**：原始秒级 tick 双折线（UP 绿、DOWN 红）
- **Candle**：客户端聚合到 5 秒 / 15 秒 / 30 秒 K 线
- 每张卡片锁定窗口范围，跨窗口对齐到 5/15 分钟边界

## 项目结构

```
src/
├── app/
│   ├── api/polymarkets/         # Route Handlers
│   ├── (admin)/                 # 保留 TailAdmin 子路由
│   ├── page.tsx                 # 首页 = Polymarket Monitor
│   └── layout.tsx
├── components/polymarkets/      # 监控页专用组件
│   ├── AssetNav.tsx
│   ├── KlineChart.tsx
│   ├── Pagination.tsx
│   ├── PolymarketMonitor.tsx
│   └── WindowCard.tsx
├── lib/
│   ├── db/
│   │   ├── constants.ts         # 客户端可见的常量
│   │   ├── path.ts              # 服务端路径解析
│   │   ├── pool.ts              # SQLite 连接池
│   │   ├── markets.ts           # markets.db 读写
│   │   ├── klines.ts            # kline 读写
│   │   └── index.ts             # barrel
│   └── format.ts
└── types/polymarkets.ts
```

## 验证

```bash
npx tsx scripts/test-db.ts   # 直接跑数据层烟雾测试
```
