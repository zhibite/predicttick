# PolyKlines（Polymarket Up/Down 实时浏览器）

基于 TailAdmin Next.js 模板搭建。Next.js 服务进程内直接维护 Polymarket
CLOB WebSocket 订阅，把盘口快照写入 SQLite，页面从 SQLite 查询并画图——不再
依赖 `future.news` 或离线 CSV 合并流程。

## 数据流

```
Gamma API（发现当前/下一窗口，取 clobTokenIds）
        ↓
CLOB WebSocket（wss://ws-subscriptions-clob.polymarket.com/ws/market）
        ↓   book / price_change / last_trade_price
内存维护 UP / DOWN 两个 token 的最优买卖价
        ↓  每秒（5m）/ 每 5 秒（15m）落盘
SQLite: markets + samples + collector_status
        ↓
Next.js API（/api/meta、/api/windows、/api/klines）→ 图表
```

采集器由 `src/instrumentation.ts` 在服务启动时拉起，只有一个单例，不需要
单独的进程或脚本。市场发现、订阅、重连、结算回填全部在
`src/server/collector.ts`。

## 采样与存储

| 市场 | 采样间隔 | 每窗口样本数 | 每天行数（7 个币） |
|---|---|---|---|
| 5m | 1 秒 | 300 | 7 × 288 × 300 = 604,800 |
| 15m | 5 秒（可配置） | 180 | 7 × 96 × 180 = 120,960 |
| 1h | 10 秒（可配置） | 360 | 7 × 24 × 360 = 60,480 |
| 4h | 30 秒（可配置） | 480 | 7 × 6 × 480 = 20,160 |
| 合计 | | | **约 806,400 行/天** |

- 每行同时保存 UP / DOWN 的 `bid`、`ask`、`mid`、`last`。
- 间隔由 `POLY_15M_SAMPLE_SECONDS` / `POLY_1H_SAMPLE_SECONDS` /
  `POLY_4H_SAMPLE_SECONDS` 控制（默认 5 / 10 / 30 秒）。
- 默认保留 180 天（`POLY_RETENTION_DAYS`），每小时清理过期样本。
- SQLite 约 80–110 MB/天；全量一年约 34–36GB，长期运行需要关注磁盘，
  建议缩短保留期或导出压缩归档。

## 市场发现（不同周期命名不同）

| 周期 | 发现方式 | slug 示例 |
|---|---|---|
| 5m / 15m | 短 slug + UTC epoch | `btc-updown-5m-1793545200` |
| 1h | Gamma series 尝试 `{短名}-up-or-down-hourly`，失败再用全名（SOL 需要 `solana-`）；取当前/下一小时 | `bitcoin-up-or-down-november-1-2026-10am-et` |
| 4h | 短 slug + ET 对齐 epoch（00/04/08/12/16/20 ET） | `btc-updown-4h-1793538000` |

1h 使用全名：`bitcoin` / `ethereum` / `solana` / `dogecoin` / `bnb` /
`xrp` / `hype`；4h、5m、15m 使用短名 `btc` / `eth` / `sol` / `doge` /
`hype` 等。

## 环境变量

```bash
POLY_COLLECTOR=1                  # 1=启用采集器；本地开发可设 0
POLY_DB_PATH=/home/ubuntu/polyklines/data/live/polyklines.sqlite
POLY_APP_DB_PATH=/home/ubuntu/polyklines/data/app/app.sqlite
POLY_ASSETS=btc,eth,bnb,sol,doge,xrp,hype
POLY_15M_SAMPLE_SECONDS=5
POLY_RETENTION_DAYS=180
POLY_PAYMENTS_ENABLED=0
POLY_LEADERBOARD_SYNC=1
POLY_LEADERBOARD_SYNC_MINUTES=30
POLY_LEADERBOARD_MAX_TRADES=1000
POLY_LEADERBOARD_MAX_CLOSED=500
POLY_PAPER_ENGINE=1
POLY_PAPER_TICK_SECONDS=5
POLY_EXPORT_WORKER=1
# POLY_EXPORT_DIR=/home/ubuntu/polyklines/data/exports
POLY_API_CORS_ORIGINS=*
POLY_BACKTEST_WORKER=1
PORT=3000
HOSTNAME=0.0.0.0
```

`POLY_DB_PATH` 默认是 `<项目>/data/live/polyklines.sqlite`，
`POLY_APP_DB_PATH` 默认是 `<项目>/data/app/app.sqlite`。

行情库和业务库分开：

- 行情库：`markets`、`samples`、`collector_status`、`stats`、`series_days`、`market_stats`
- 业务库：用户、通行证、发票、支付配置、API Key、策略、导出/回测任务

数据库迁移由 `src/server/migrate.ts` 版本化管理。旧库启动后会自动补齐
`series_days` / `market_stats` 表；历史数据用一次性回填：

```bash
npm run backfill:stats
# 或强制重算所有已结束窗口
npm run backfill:stats -- --all
```

## 数据库

```sql
markets(slug PK, asset, period, start_epoch, end_epoch,
        condition_id, up_token, down_token, title, resolved,
        discovered_at, finalized_at)

samples(slug, ts, up_bid, up_ask, up_mid, up_last,
        down_bid, down_ask, down_mid, down_last,
        PRIMARY KEY(slug, ts)) WITHOUT ROWID

collector_status(id=1, started_at, heartbeat_at, ws_connections,
                 active_markets, messages_total, samples_total, last_error)

-- 按 asset/period/UTC 日聚合，供覆盖范围和导出预估使用
series_days(asset, period, day, markets, resolved, samples, updated_at,
            PRIMARY KEY(asset, period, day)) WITHOUT ROWID

-- 每个窗口的样本数、首末时间和 UP/DOWN OHLC
market_stats(slug PK, sample_count, first_ts, last_ts,
             up_open, up_high, up_low, up_close,
             down_open, down_high, down_low, down_close, computed_at)
```

业务库 `app.sqlite` 目前预留了用户、通行证/发票、支付配置、API Key、
策略和回测任务等表；支付功能默认关闭，`payment_wallets` 不预置地址。

`ts` 是 Unix 秒（UTC）。`resolved` 为 `UP` / `DOWN` / `UNKNOWN`；窗口结束后
采集器会用 Gamma 的 `outcomePrices` 反复回填，直到结算完成。

## 页面与 API

| 路径 | 说明 |
|---|---|
| `/` | 总览：实时状态、币种、窗口数、样本数、数据库信息 |
| `/markets` | 窗口浏览器；默认选中当前正在交易的窗口，交易中每 2 秒刷新 |
| `/pricing` | Basic / Pro 价格和权益 |
| `/signin`、`/signup` | 注册 / 登录 |
| `/account`、`/account/billing` | 账户、通行证、发票 |
| `/account/api-keys` | 创建/撤销 API Key |
| `/download` | 付费用户的 CSV 导出 |
| `/backtest` | 自定义 JS 策略回测 |
| `/api/docs` | 公共 API 文档 |
| `/leaderboard` | 手工维护的 Polymarket 交易者排行榜 |
| `/leaderboard/[address]` | 单个交易者的 PnL、持仓与行为分析 |
| `/admin/leaderboard` | 管理员添加/同步/隐藏排行榜地址 |
| `/admin/paper` | 管理员纸盘策略列表与创建 |
| `/admin/paper/[id]` | 纸盘权益、持仓、成交与结算记录 |
| `/admin/payments` | 管理员人工审核发票 |
| `/admin/settings/payments` | 管理员配置收款地址/合约 |
| `/admin/system` | 管理员查看 collector/jobs/队列/磁盘状态 |
| `/api/meta` | 资产 / 周期 / 日期 / 采集器状态 |
| `/api/windows?asset=&period=&date=` | 某天窗口（按时间倒序） |
| `/api/klines?slug=` | 单个窗口的 UP / DOWN 序列 |
| `/api/auth/*` | 注册、登录、会话、邮箱验证、密码重置 |
| `/api/billing/invoices` | 创建 / 查看用户发票 |
| `/api/admin/payment-wallets` | 管理员读取 / 保存收款配置 |
| `/api/admin/payments` | 管理员查看 / 审核发票 |
| `/api/v1/*` | 带 API Key 的公共 API |
| `/api/v1/openapi.json` | OpenAPI 3.1 规范 |
| `/api/backtest/*` | 策略、回测、参数扫描 |
| `/api/health` | 运维健康检查 |

账户、邮箱验证、支付配置和人工审核的细节见
[auth-and-billing.md](auth-and-billing.md)。CSV 导出、配额和后台任务见
[data-export.md](data-export.md)。公共 API、Key、限流和分页见
[public-api.md](public-api.md)。策略格式、沙箱和回测指标见
[backtest.md](backtest.md)。独立 jobs、监控、备份和安全 smoke test 见
[operations.md](operations.md)。交易者排行榜、数据来源、指标口径和后台地址管理见
[leaderboard.md](leaderboard.md)。纸盘交易、成交记录和目标账户策略归因见
[paper-trading.md](paper-trading.md)。

## 本地开发

```bash
npm install
# .env.local 里设置 POLY_COLLECTOR=0（本地无法直连 Polymarket）
npm run dev
```

本地页面会展示本地 `data/live/polyklines.sqlite` 中的数据；如果要看服务器
实时数据，可把隧道映射到本地端口：

```bash
ssh -N -L 3200:127.0.0.1:3000 -i yimifa.pem ubuntu@3.252.79.139
# 打开 http://localhost:3200
```

## 部署（EC2）

服务器上使用 standalone 产物 + systemd：

```bash
# 本地构建
npm run build
# 复制 .next/standalone、.next/static、public 到服务器
# 注意不要覆盖服务器上的 data/live/*.sqlite
```

`/etc/systemd/system/polyklines.service`：

```ini
[Unit]
Description=PolyKlines live Polymarket Up/Down explorer
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/polyklines
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=POLY_COLLECTOR=1
Environment=POLY_DB_PATH=/home/ubuntu/polyklines/data/live/polyklines.sqlite
Environment=POLY_ASSETS=btc,eth,bnb,sol,doge,xrp,hype
Environment=POLY_15M_SAMPLE_SECONDS=5
Environment=POLY_RETENTION_DAYS=180

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now polyklines
sudo journalctl -u polyklines -f
```

当前服务器的 80 端口已被现有站点占用，新站跑在 3000 端口；对外访问需要
在安全组放行端口或配置 nginx 反向代理。

## 已知限制

- **官方历史数据不能回补 1 秒盘口**：CLOB `prices-history` 只有约 1 分钟粒度
  （5m 窗口 2–5 个点），冷门币的成交记录也很稀疏。真正的 1 秒数据只能从
  部署采集器之后开始积累。
- 服务重启期间会产生采样缺口；`collector_status` 和 `markets.finalized_at`
  可用于检查。
- 15m 采样间隔是研究精度与存储量的折中；需要更细可把
  `POLY_15M_SAMPLE_SECONDS` 调小（存储线性增加）。
- Gamma 结算可能滞后于窗口结束，采集器会重试回填；极少数市场可能一直
  保持 `UNKNOWN`。
