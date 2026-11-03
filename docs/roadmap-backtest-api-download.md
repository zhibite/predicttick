# PolyKlines 回测 / 公共 API / 数据下载 / 付费 SaaS 规划

> 状态：草案 · 2026-11-02
>
> 变更记录：2026-11-02 支付改为 USDT/USDC 低费网络 + 二维码 + 后台人工审核（V1 已确认不接网关/自动校验）；首发 **TRC20 + Base + Polygon**；审核 SLA **12 小时**；年付 **8 折**（$180/$560）；**watch-only 地址/token contract 暂不填写，只预留字段和开关**；`/markets` 改为免费浏览；网站界面全部英文。
>
> 已确认的方向：
> - 回测：用户自定义 JavaScript 策略，开放给注册用户
> - API：API Key + 限流
> - 下载：CSV（大文件 gzip）
> - 历史数据：延长原始数据保留期（不删旧数据）
> - 商业模式：站点收费，Basic $19/月，Pro $59/月；**仅支持 USDT/USDC 低费网络**
> - 支付方式：**TRC20 / Base / Polygon** 二维码收款 + 用户提交 txid + **后台人工审核，12 小时内完成**（V1 不接链上自动校验；地址/合约未配置前支付功能不启用）
> - 年付：**8 折取整**（Basic $180/年，Pro $560/年）
> - 访问策略：`/markets` 浏览免费；回测/API/CSV 下载需要有效通行证
> - 策略权限：注册并购买通行证的用户可以创建策略
> - 界面语言：所有面向用户的页面、邮件、错误提示、API 文档均为英文
> - 基础设施：EBS 会扩容

---

## 1. 目标

在现有实时采集与窗口浏览器之上，增加三条数据出口：

| 功能 | 用户价值 | 入口 | 访问 |
|---|---|---|---|
| Markets 浏览 | 查看实时和近期窗口走势 | `/markets` | 免费（匿名可看近 7 天；注册可看近 30 天） |
| 账户与通行证 | 注册、登录、通行证、配额、付款记录 | `/signup`、`/pricing`、`/account` | 注册免费；付款后解锁 |
| 回测 | 用自定义 JS 策略在历史窗口上模拟交易，查看收益、胜率、校准度 | `/backtest` | 注册（Free 可试用 3 次；完整功能需通行证） |
| 公共 API | 外部程序按币种/周期/时间范围获取历史行情与窗口元数据 | `/api/v1/*` | API Key + 有效通行证 |
| 数据下载 | 按条件导出 CSV，供 Excel/pandas/研究使用 | `/download` | 注册 + 有效通行证 |

免费 `/markets` 是获客入口，但只开放近期数据、只做页面查询，不提供批量导出；完整历史、回测、API、CSV 下载属于付费功能。

回测/API/下载共用同一套查询、分页、CSV 导出、配额和数据质量统计逻辑，避免各写一套。

---

## 2. 现状与约束

### 2.1 现有数据

- `markets`：每个 Up/Down 窗口一行，含 `slug`、`asset`、`period`、`start_epoch`、`end_epoch`、`resolved`。
- `samples`：每秒/每 5s/10s/30s 一条盘口快照，主键 `(slug, ts)`，含 UP/DOWN 的 bid/ask/mid/last。
- 采样量约 **80.6 万行/天**，约 **34–36 GB/年**；延长到 2 年约 **70–75 GB**。
- `resolved` 可能为 `UNKNOWN`；回测默认排除。
- 数据中没有成交量、逐笔成交和订单簿深度，回测只能基于盘口快照做 **taker 策略** 模拟。

### 2.2 现有 API

- `/api/meta`、`/api/windows`、`/api/klines` 是页面内部接口，无鉴权。
- 一旦站点对外公开，这些内部接口会绕过公共 API 的 Key 限制，因此部署时必须区分「公开 API」和「站内接口」。

### 2.3 服务器

- EC2 2 vCPU / 908 MB RAM，Next + collector 约 70 MB。
- 2 年数据需要扩容 EBS，并限制回测/导出任务的并发与内存。
- SQLite 单写者：collector 持续写入，导出/回测读多写少，使用 WAL + 串行任务。
- 收费上线后会有并发用户、通行证校验、回测和导出，908 MB 内存偏紧。**建议上线前升级到 2 vCPU / 4 GB（如 t4g.medium）**，并保留独立 jobs 进程；后续按用户量再横向扩展。

### 2.4 现有登录状态

- `src/app/(admin)/layout.tsx` 目前是纯客户端布局；`/signin`、`/signup` 只是 TailAdmin 演示表单，没有真实认证、会话或用户表。
- `UserDropdown` 写死了用户名/邮箱，退出登录只是跳转链接。
- 因此「注册用户 + 通行证」不是在现有 auth 上打补丁，而是需要补一整套账户、会话、邮件验证、数字支付和权限系统。

---

## 3. 总体架构

```
访客 ─────────────→ 营销页 /markets(近7天) / 定价 / API 文档 / 法务页
注册用户 ─ Auth 会话 ─→ Free(近30天) 或 通行证校验 ─→ 付费页面
外部程序 ─ API Key ──→ 用户/通行证 ─────────────→ /api/v1/*
管理员确认 / 链上校验 ─→ crypto_invoices → user_access
                                            ↓
Polymarket WS → collector (Next 进程内) → SQLite
                                            │
                    ┌───────────────────────┼───────────────────────┐
                    ↓                       ↓                       ↓
              共享查询层               CSV 导出服务              回测引擎
           (按套餐限历史范围)      → /download + export_jobs   → QuickJS 沙箱
                    │                       │                       │
                    └───────────────────────┼───────────────────────┘
                                            ↓
                             polyklines-jobs（独立 systemd）
                             按用户配额串行执行导出/回测
```

关键原则：

1. **多租户**：所有用户数据带 `user_id`；策略、回测、导出、API Key 必须校验归属，防止越权。
2. **分层访问**：匿名 `/markets` 近 7 天、Free 注册近 30 天、Basic/Pro 全量；回测/API/导出必须有效通行证。
3. **三层校验**：页面（session + access_until）、API（key + plan）、任务（quota + ownership）都要检查，任何一层都不能省。
4. **免费接口防抓取**：内部 `/api/meta|windows|klines` 匿名只允许近期单窗口查询，按 IP 限流，不提供批量/导出；完整历史走付费 API。
5. **重任务出进程**：导出和回测放到独立的 `polyklines-jobs` 进程，避免阻塞 Next 事件循环和 collector。
6. **单一查询层**：页面、API、下载、回测都通过 `src/server/query/*` 取数，统一时间/字段/空值语义。
7. **任务串行 + 按套餐排队**：全局限制并发；Pro 可优先，但不能无限并发。

---

## 4. 账户、通行证与付费墙

### 4.1 认证与会话

- 推荐 **Auth.js v5（NextAuth）+ `data/app/app.sqlite`（`node:sqlite`）**，不引入额外原生依赖；若 Next.js 16 兼容性有问题，再评估 Better Auth（需要 `better-sqlite3`）或 Clerk。
- 登录方式：
  - 邮箱 + 密码（Node 内置 `crypto.scrypt` 哈希，避免原生 argon2 依赖）；
  - Google OAuth（后续可加 GitHub / X）；
  - 邮箱验证 + 忘记密码。
- 邮件发送：优先 AWS SES（已在 AWS，成本低），备选 Resend；配置 SPF/DKIM/DMARC。
- 会话：`httpOnly` + `Secure` + `SameSite=Lax` Cookie，7 天滚动过期；修改密码/封禁时递增 `token_version`，让旧会话失效。
- 登录限流、失败次数限制、Cloudflare Turnstile（防撞库/注册机器）；管理员强制 TOTP MFA。
- 角色：`user` / `admin`。管理员可查看用户、封禁、调整套餐、查看审计日志。
- 现有 `src/app/(admin)/layout.tsx` 是 `"use client"`；改为外层 Server Layout 做 `auth()` 校验并 `redirect`，内部继续复用现有客户端 shell。
- `UserDropdown` 改为读取真实 session；退出登录走 Server Action 清 Cookie。

### 4.2 数据库拆分

新增一个小的业务库，和行情库分开：

```
data/live/polyklines.sqlite   行情：markets / samples / collector_status / stats / series_days / market_stats
data/app/app.sqlite           业务：users / sessions / crypto_invoices / user_access / payment_wallets / plans / usage / strategies / jobs / api_keys / audit
```

好处：

- 70 GB 行情库和小业务库分开备份、分开恢复；
- 登录/计费/任务状态写入不会影响行情采集；
- 行情库迁移风险更低。
- 跨库不建外键，统一用 `user_id` 逻辑关联；所有业务查询必须带 `user_id`。

### 4.3 套餐与权益

套餐定义放数据库（`plans`），不硬编码价格和限额，方便调价和做活动。

**订阅采用预付通行证（access pass）**：购买 30 天或 365 天访问，不自动扣款；到期前邮件提醒续费。这样不需要银行卡代扣，也适合数字货币一次性付款。对外文案可以写 `$19/month` / `$59/month`，但条款要明确这是 **30 天预付通行证，不自动续费**。

推荐权益矩阵（可调整）：

| 权益 | Free（注册） | Basic $19/30 天 | Pro $59/30 天 |
|---|---|---|---|
| `/markets` 浏览 | 近 30 天（匿名近 7 天） | 365 天 | 730 天 |
| 回测次数/天 | 3 次一次性试用 | 50 | 500 |
| 单次回测范围 | 7 天 | ≤ 90 天 | ≤ 730 天 |
| 并发回测 | 1 | 1 | 2 |
| 参数扫描 / 批量对比 | — | — | ✓ |
| 保存策略数 | —（不能创建策略） | 50 | 500 |
| 回测结果保留 | 7 天 | 30 天 | 180 天 |
| API Key 数 | — | 1 | 5 |
| API 速率 | — | 60 次/分钟 | 300 次/分钟 |
| API 请求/天 | — | 10,000 | 100,000 |
| API / 导出历史 | — | 365 天 | 730 天 |
| CSV 导出/天 | — | 5 GB | 50 GB |
| 导出文件保留 | — | 7 天 | 30 天 |
| 支持 | 文档 | 邮件 | 优先邮件 |
| 付款方式 | 无 | USDT/USDC：TRC20 / Base / Polygon | USDT/USDC：TRC20 / Base / Polygon |
| 年付（8 折取整） | — | **$180 / 365 天** | **$560 / 365 天** |

试用与免费层建议：

- **匿名**：`/markets` 最近 7 天，按 IP 限流，不能回测/API/导出。
- **免费注册**：`/markets` 最近 30 天 + 3 次一次性回测试用，用于转化；需邮箱验证，防滥用。
- **付费**：30 天通行证，可叠加续费；到期后自动回落到免费注册层，不删除账户和数据。
- 年付：365 天通行证 **8 折取整**，Basic **$180/年**、Pro **$560/年**（相当于 $15/月、$46.67/月），提高现金流。
- 因为数字货币无法绑定银行卡做自动续费，**不做「7 天自动转付费」**；改为有限试用 + 到期提醒。

### 4.4 数字货币支付与通行证

#### 计费模型

- 采用 **预付通行证**：购买 30 天或 365 天访问，不自动续费；到期前提醒，用户手动续费。
- 价格以 USD 标价（Basic $19、Pro $59），只收 **USDT / USDC**，按 1:1 计价，不做币价换算。
- **V1 首发网络（已确认）**：

| 网络 | 代币 | 浏览器 | 说明 |
|---|---|---|---|
| Tron（TRC20） | USDT | Tronscan | 6 位小数；建议 19–20 确认 |
| Base | USDC | Basescan | 6 位小数；建议 12–30 确认 |
| Polygon | USDT / USDC | Polygonscan | 6 位小数；建议 30–60 确认 |

- **V1.1 再评估**：BSC（BEP20 USDT，18 位小数）、Solana（USDC，finalized）。V1 不做，减少钱包兼容性和审核复杂度。

- 每个 `network + currency` 配置一个专用收款地址和固定的 token contract / decimals；地址与合约放环境变量或 `payment_wallets` 表，不写死在前端。V1 预留 Tron-USDT、Base-USDC、Polygon-USDT、Polygon-USDC 四条配置，暂不填值。
- 页面展示：二维码、收款地址、网络、代币、精确金额、发票号、30 分钟倒计时、风险提示。
- 网络手续费由用户承担；站内不托管用户资金，也不在服务器保存私钥。
- 付款后由用户在页面提交 **txid**，进入后台待确认队列；管理员核对链上信息后手动开通。

#### 收款方案对比（是否要更简便）

| 方案 | 操作 | 成本 | 适用 |
|---|---|---|---|
| **A. 自建二维码 + txid + 人工审核（当前 V1）** | 无需 KYC；每笔人工核对 | 0 网关费；人工成本 | 单量少、想自己控制 |
| **B. 托管加密网关**（NOWPayments / Coinbase Commerce / Cryptomus 等） | 自动生成 invoice/QR、自动检测确认、webhook；后台只处理异常 | 约 0.5%–1% + KYC | 单量上来、想省审核 |
| **C. 自托管 BTCPay Server** | 自动检测 BTC/Lightning；USDT/USDC 多链需插件并逐一验证 | 0 网关费 + VPS/钱包运维 | 只收 BTC/Lightning 或愿意运维 |
| **D. 真正自动续费** | 需要订阅合约/账户抽象/托管代扣 | 高 | 不建议 |

结论：

- **加密货币没有像银行卡一样简单的自动续费**：钱包不能授权商户每月扣款。预付 30/365 天通行证是最简单的模式。
- **V1 已确认采用 A（人工审核）**，不接托管网关、不做链上自动校验；如果每天付款超过约 10 笔，或 12 小时 SLA 难以保证，再评估切换到 **B**。
- 切 B 时再引入 `CryptoPaymentProvider` 接口，`crypto_invoices` 增加 provider/invoice id；后台确认台保留用于异常和退款。
- 年付 8 折能显著减少审核次数，是当前最简单的降本方式。

#### 收款方式与二维码

- 不接第三方收银台，直接生成自己的收款二维码；QR 用服务端 `qrcode` 库生成，不依赖外部二维码 API。
- 收款地址按网络区分，建议使用 **watch-only 钱包/硬件钱包地址**，私钥离线保存；服务器只保存地址，不保存私钥/助记词。
- 二维码内容按链生成，并同时展示可复制的文字信息：
  - EVM（V1：Polygon/Base；BSC 在 V1.1）：优先使用 EIP-681 `ethereum:<tokenContract>@<chainId>/transfer?address=<recipient>&uint256=<amount>`；`uint256` 用最小单位（金额 × 10^decimals）；不支持的 wallet 回退到「复制地址 + 手动选择代币 + 输入金额」。
  - Tron：展示 Tron 地址二维码 + TRC20 合约/金额文字；如钱包支持 `tron:` URI 可加「Open in wallet」。
  - Solana（V1.1）：优先 Solana Pay `solana:<recipient>?amount=<amount>&spl-token=<mint>`。
- **重要**：普通地址二维码在 EVM 钱包里可能默认发送原生币，而不是 USDT/USDC；必须显著标注网络和代币，并尽量使用带 token contract 的支付 URI。
- 同一个网络可以复用收款地址，但每张发票必须：
  - 金额精确（按 token decimals 格式化）；
  - 要求用户提交 txid；
  - 以 `(network, txid)` 唯一约束防止同一笔交易被重复使用。
- 如果要降低人工匹配成本，可在金额后加极小的唯一尾数（例如 19.000137 USDT），但 UI 必须明确「请支付精确金额」；不作为强制方案。

#### 配置预留（地址/合约暂不填写）

V1 先把功能和字段预留好，不预置真实收款地址或 token contract：

- `payment_wallets` 表保留 `network / currency / token_contract / token_decimals / deposit_address / explorer_base / active`；`active` 默认 **0**。
- 全局开关 `POLY_PAYMENTS_ENABLED` 默认 **0**；即使表里有数据，也必须显式开启才会展示支付入口。
- 创建发票前必须同时满足：
  - 全局开关开启；
  - `network + currency` 对应配置存在且 `active=1`；
  - `deposit_address`、`token_contract`、`token_decimals` 完整且格式合法。
  - 否则返回 `409 PAYMENT_NOT_CONFIGURED`，不生成发票、不展示二维码。
- 定价页/结账页只展示已配置且启用的网络；全部未配置时显示：
  - `Crypto payments are not available yet.`
  - 保留定价、FAQ 和联系支持入口，不显示无法完成的付款按钮。
- 管理员页面 `/admin/settings/payments` 预留：
  - 新增/编辑每个 `network + currency` 的地址、合约、decimals、explorer；
  - `active` 开关；
  - 保存前格式校验 + 二次确认 + 审计日志；
  - 显示「未配置」警告。
- `.env.example` 只放空变量和注释，例如：
  ```bash
  POLY_PAYMENTS_ENABLED=0
  POLY_TRON_USDT_ADDRESS=
  POLY_BASE_USDC_ADDRESS=
  POLY_POLYGON_USDT_ADDRESS=
  POLY_POLYGON_USDC_ADDRESS=
  ```
- 开发和演示使用 fixture/mock 配置，不接触真实资金；生产启用前必须人工复核地址、合约和 decimals。
- 支付入口、发票、后台审核台可以先实现，但在配置完成前保持不可用。

#### 数据表

```sql
crypto_invoices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  duration_days INTEGER NOT NULL,
  price_usd_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,               -- USDT / USDC
  network TEXT NOT NULL,                -- tron / bsc / polygon / base / solana
  chain_id INTEGER,                     -- EVM only: 56 / 137 / 8453
  token_contract TEXT NOT NULL,         -- 必须与网络匹配
  token_decimals INTEGER NOT NULL,      -- V1 均为 6；V1.1 的 USDT-BSC 为 18
  amount_token TEXT NOT NULL,           -- 十进制字符串，避免浮点误差
  deposit_address TEXT NOT NULL,
  status TEXT NOT NULL,                 -- awaiting_payment|submitted|approved|rejected|expired|refunded
  txid TEXT,
  payer_address TEXT,
  submitted_at INTEGER,
  reviewed_by TEXT,
  reviewed_at INTEGER,
  review_note TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  approved_until INTEGER,               -- 本次批准后 access_until
  raw_json TEXT
);

CREATE UNIQUE INDEX idx_crypto_invoices_txid
  ON crypto_invoices(network, txid)
  WHERE txid IS NOT NULL;

user_access (
  user_id TEXT PRIMARY KEY,
  plan_code TEXT,                       -- NULL=Free
  access_until INTEGER,                 -- Unix 秒；NULL/过去=无付费权限
  updated_at INTEGER NOT NULL
);

usage_daily (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,
  api_requests INTEGER NOT NULL DEFAULT 0,
  export_bytes INTEGER NOT NULL DEFAULT 0,
  backtest_runs INTEGER NOT NULL DEFAULT 0,
  backtest_windows INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
) WITHOUT ROWID;

audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  target TEXT,
  metadata_json TEXT,
  created_at INTEGER NOT NULL
);

plans (
  code TEXT PRIMARY KEY,                -- free / basic / pro
  name TEXT NOT NULL,
  price_usd_cents INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  features_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

payment_wallets (
  network TEXT NOT NULL,                -- tron / bsc / polygon / base / solana
  currency TEXT NOT NULL,               -- USDT / USDC
  token_contract TEXT NOT NULL,
  token_decimals INTEGER NOT NULL,
  deposit_address TEXT NOT NULL,
  explorer_base TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (network, currency)
) WITHOUT ROWID;
```

#### 付款流程

1. 登录用户选择 Basic/Pro 的 30 天或 365 天通行证，再选择网络（Tron / Base / Polygon）。
2. 服务端：
   - 校验用户没有过多待处理发票（例如最多 3 张）；
   - 生成 `crypto_invoices` 记录，锁定网络、代币、合约、金额、收款地址；
   - 生成二维码和 30 分钟倒计时。
3. 页面显示二维码、地址、精确金额、网络/代币、发票号；用户付款。
4. 用户在页面提交 **txid**（可选填付款地址），发票状态变为 `submitted`，页面显示「Payment under review」。
5. 管理员在 `/admin/payments` 查看待确认列表：
   - 打开对应浏览器链接（Tronscan / Basescan / Polygonscan）；
   - 核对 txid 存在、收款地址正确、token contract 正确、金额足够、确认数达到阈值、txid 未被其他发票使用；
   - 点击 Approve 或 Reject，填写备注。
6. Approve 时在事务中：
   - 状态改为 `approved`，写 `reviewed_by` / `reviewed_at`；
   - `user_access.access_until = max(now, access_until) + duration_days`；
   - 清理权益缓存；
   - 发收据邮件；
   - 写 `audit_log`。
7. Reject 时写原因；用户可重新创建发票或联系支持。
8. 提前续费：从当前 `access_until` 往后叠加，不清空剩余时间。
9. 升级：购买 Pro 后立即生效；V1 不做剩余 Basic 时间的按比例折算。
10. 到期前 7/3/1 天发续费提醒；到期后回落到 Free，不删除账户、策略和历史。

#### 后台确认台

`/admin/payments` 需要管理员权限 + TOTP MFA：

- 视图：待确认（`submitted`）、待付款（`awaiting_payment`）、已批准、已拒绝、已过期。
- 每条显示：用户邮箱、套餐、金额、网络、代币、txid、付款地址、提交时间、等待时长、浏览器链接。
- 操作：Approve / Reject / 复制地址/金额 / 打开浏览器 / 备注。
- 安全：
  - 不用截图作为付款凭证，必须以链上 txid 为准；
  - Approve 二次确认，禁止批量一键批准（V1）；
  - Approve 幂等：只有 `status=submitted` 时可批准，重复点击不重复延长权益；
  - 同一 `(network, txid)` 只能使用一次；
  - Reject 后用户可创建新发票，但同一 txid 不能复用；
  - 所有操作写 `audit_log`；
  - 管理员不能修改已完成发票的金额，只能走手动调整/退款流程；
  - 年付/大额或异常付款建议双人复核（V1 可配置阈值）。
- 对账：按日导出已批准发票与钱包实际到账记录，人工核对；发现差异暂停开通。
- 审核 SLA：**12 小时内完成**；用户页面显示 `Payments are reviewed within 12 hours.`；超过 12 小时未处理提醒管理员。

#### 审核范围（V1）

- V1 **只做人工审核**，不接 TronGrid / EVM RPC / Solana RPC，也不自动开通。
- 管理员必须逐笔打开浏览器核对 txid；这是 V1 的运营成本，需要在定价和 SLA 中体现。
- V2 如果单量变大，再加链上自动校验和自动开通；V1 不预留复杂接口，避免范围膨胀。

#### 二维码与钱包兼容性

- 二维码必须同时展示文字版地址和金额，避免用户只扫码不看网络。
- V1 钱包测试：TronLink（Tron）、MetaMask / Trust Wallet / OKX Wallet（Base/Polygon）；每个网络至少实测 2 个钱包。Solana/Phantom 放到 V1.1。
- 每个网络页面上明确写：
  - `Send only USDT (TRC20) on Tron to this address`
  - `Send only USDC on Base to this address`
  - 错误网络/代币可能导致资金永久丢失。
- 金额格式：V1 的 USDT/USDC 都是 6 位小数；V1.1 的 USDT-BSC 是 18 位，必须按 `token_decimals` 显示，不能统一写 6 位。
- 发票过期后停止展示二维码；已付款但过期的走人工处理。

#### 异常处理

- 过期未付：定时任务标记 `expired`，不计入权益。
- 少付：允许补付差额（生成补款发票）或拒绝；由管理员在备注中说明。
- 多付：记录差额，可退款或转为账户 credit；写审计日志。
- 重复 txid：唯一索引拒绝；提示用户联系支持。
- 错误网络/错误代币：链上资金可能无法找回；后台标记异常，人工跟进。
- 假截图/假 txid：一律不认，必须核对链上交易。
- 用户付款但未提交 txid：后台可按金额/时间/付款地址人工匹配，匹配成功后补录 txid。
- 支付后链上回滚/重组：等待足够确认数；已开通但回滚的暂停权益并人工核查。
- 退款：原路退回并扣网络手续费；按未使用天数扣回权益；写审计日志。
- 管理员误操作：保留审计记录，允许通过反向调整/手动 credit 修正，不直接改历史。
- 收款地址轮换：旧地址保留观察期，避免用户付款到旧地址后无法对账。

#### 收据与税务

- 收据邮件包含：发票号、USD 金额、网络/代币、精确金额、txid、有效期、到期日。
- 用户可在 `/account/billing` 查看历史发票、当前有效期、待审核状态。
- 数字货币支付不自动处理 VAT/销售税；需要会计/税务顾问确认。
- 退款政策、少付/多付处理、错误网络处理、发票条款写入 `docs/billing.md` 和法务页面。
- 每日/每月导出收款记录，和钱包余额、会计账目核对。

### 4.5 配额与多租户

- 所有用户数据表都带 `user_id`：`strategies`、`backtest_runs`、`export_jobs`、`api_keys`。
- 读取单条资源时必须同时匹配 `user_id`，禁止只用 ID 查询（防 IDOR）。
- 管理员可以跨用户查看，但必须写审计日志。
- 权益服务 `getEntitlements(userId)` 返回：

```ts
{
  plan: "free" | "basic" | "pro" | "admin",
  accessUntil: number | null,          // Unix 秒；null/过去 = 无付费权限
  historyDays: 30 | 365 | 730,         // Free 注册 30；匿名单独 7
  apiKeys: 0 | 1 | 5,
  ratePerMinute: 0 | 60 | 300,
  requestsPerDay: 0 | 10_000 | 100_000,
  exportBytesPerDay: 0 | 5_368_709_120 | 53_687_091_200,
  backtestRunsPerDay: 0 | 50 | 500,
  backtestTrialRuns: 3,                // Free 一次性试用
  backtestMaxDays: 7 | 90 | 730,
  backtestConcurrency: 0 | 1 | 2,
  savedStrategies: 0 | 50 | 500,
  resultRetentionDays: 7 | 30 | 180,
}
```

- 匿名访问单独一套公开限额：`/markets` 最近 7 天，按 IP 限流，无回测/API/导出。
- Free 注册用户：`/markets` 最近 30 天 + 3 次一次性回测试用（只能运行内置示例策略）；不能创建/保存策略、不能导出、不能建 API Key。
- 配额消费：
  - API 请求：内存计数 + 定期写 `usage_daily`；
  - 导出：按实际写出字节数扣减；
  - 回测：创建任务时扣次数，按窗口数扣预算；
  - 失败任务是否退还次数：只有系统错误退还，策略自身错误不退还（防止刷）。
- API 状态码语义：
  - `401`：无 Key / Key 无效；
  - `402`：通行证过期或未激活；
  - `403`：当前套餐无此权限 / 超出历史范围；
  - `429`：速率或日配额超限。
- 页面访问：
  - `/markets` 对匿名开放（近 7 天），免费注册可看近 30 天；
  - `/backtest` 登录后可进入：Free 只能运行内置示例 + 3 次试用，完整参数/保存策略需要有效通行证；
  - `/download`、`/strategies`、`/account/api-keys` 需要登录 + 有效通行证；未登录 → `/signin?next=...`，无通行证 → `/pricing?reason=access`；
  - 通行证到期后自动回落到 Free，不删除策略和结果。
- 任务队列：全局并发 1–2；每个用户最多 1–2 个；Pro 优先；避免一个用户占满服务器。

### 4.6 页面与导航

**所有面向用户的页面、邮件、错误提示、API 文档均为英文**；内部规划文档可以保持中文。当前站点的英文 UI 继续沿用。

公开页面（无需登录）：

- `/`（营销首页/产品介绍）
- `/markets`（免费浏览；匿名只显示最近 7 天）
- `/pricing`（Basic/Pro 通行证和加密货币支付说明）
- `/api/docs`、`/api/v1/openapi.json`
- `/terms`、`/privacy`、`/refund`
- `/signin`、`/signup`、`/forgot-password`、`/reset-password`、`/verify-email`

免费注册后：

- `/account`（资料/安全）
- `/markets` 可看最近 30 天
- `/backtest` 显示 3 次试用入口，但不能创建/保存策略
- `/pricing`、升级引导

登录 + 有效通行证后：

- `/backtest`（完整功能：自定义策略、保存、长区间）
- `/strategies`
- `/download`
- `/account/api-keys`
- `/account/billing`（通行证、待审核/历史发票、续费、收据；没有银行卡/自动扣款）
- `/account/usage`（API/导出/回测用量）

管理员：

- `/admin/users`、`/admin/payments`、`/admin/settings/payments`、`/admin/plans`、`/admin/audit`
- 手动创建发票、人工开通/延长通行证、处理少付/多付/退款

导航调整：

- 侧边栏按登录状态/角色显示；`Markets` 始终可见；无通行证时显示 `Upgrade`。
- Header 显示真实用户名、套餐 Badge、通行证到期日、用量快捷入口。
- 达到限额或通行证到期时在页面内展示升级/续费提示，而不是只报错。
- 所有新页面文案、按钮、空状态、错误信息、邮件模板使用英文；代码里的注释可以保持现有风格。

### 4.7 安全与合规

- 密码使用 `scrypt` + 随机 salt；登录/重置接口限流；会话 Cookie 加 `httpOnly`/`Secure`/`SameSite`；状态变更接口校验 Origin/CSRF。
- **不托管私钥**：收款地址使用 watch-only 钱包/硬件钱包，私钥离线保存；应用服务器只保存地址，不保存助记词/私钥。
- 支付安全：
  - 发票金额、网络、代币合约、收款地址必须来自服务端配置 `payment_wallets`，不在前端拼装；
  - 用户提交 txid 后，管理员必须核对链上交易；不接受截图作为凭证；
  - `(network, txid)` 唯一约束，防止同一笔交易重复开通；
  - 创建发票接口按用户/IP 限流，限制待处理发票数量，防止刷发票；
  - 管理员手动开通/拒绝/退款必须二次确认并写审计日志。
- **合规重点**：
  - 数字货币支付在部分司法辖区受限；如果运营主体/个人在中国大陆，需要先咨询当地法律和税务意见，评估是否合规；
  - 即使不接第三方网关，仍可能需要履行 AML/KYC、制裁名单筛查和税务申报义务，按所在地要求执行；
  - 数字货币不可撤销，退款只能人工原路退回并扣网络费；
  - 记录 USD 定价、网络、代币、金额、txid、确认数、审核人，便于审计和税务申报。
- 必备法务页面：服务条款、隐私政策、退款政策、可接受使用政策、API 使用条款、加密支付说明。
- **金融免责声明**：历史回测不构成投资建议，不保证未来收益。
- **Polymarket 数据再分发条款需要先核对**：收费转售采集数据可能受上游条款限制，必要时联系 Polymarket 获取授权或调整产品形态。
- 税务：数字货币支付不自动处理 VAT/销售税；需要会计/税务顾问确认申报方式。
- 数据合规：提供账户删除、数据导出；隐私政策说明采集的邮箱、付款地址/txid 和用量数据。
- 滥用防护：邮箱验证、Turnstile、一次性试用限额、API/回测配额、策略沙箱 CPU 限额、发票创建限流。
- 管理操作、付款开通、退款、套餐调整写审计日志。

---

## 5. 共用数据层

### 5.1 迁移机制

当前 `src/server/db.ts` 直接用 `CREATE TABLE IF NOT EXISTS`。新增表较多，改为版本化迁移：

```ts
// src/server/migrations.ts
const MIGRATIONS = [
  { version: 1, sql: `...` },
  { version: 2, sql: `...` },
];
```

- 新建 `schema_migrations(version, applied_at)`。
- 启动时在事务中依次执行未应用的迁移。
- 所有新表只增不改；删除字段暂不做。

### 5.2 新增表

`crypto_invoices`、`user_access`、`payment_wallets`、`plans` 已在 4.4 定义，这里不重复。下面区分行情库和业务库：

```sql
-- ===== 行情库 data/live/polyklines.sqlite =====

-- 每个 asset/period/UTC 日的数据覆盖情况，供 meta、下载预估、API coverage 使用
CREATE TABLE series_days (
  asset TEXT NOT NULL,
  period TEXT NOT NULL,
  day TEXT NOT NULL,              -- YYYY-MM-DD (UTC)
  markets INTEGER NOT NULL,
  resolved INTEGER NOT NULL,
  samples INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (asset, period, day)
) WITHOUT ROWID;

-- 每个窗口的统计，供 API 列表、下载预估、回测覆盖判断
CREATE TABLE market_stats (
  slug TEXT PRIMARY KEY,
  sample_count INTEGER NOT NULL,
  first_ts INTEGER,
  last_ts INTEGER,
  up_open REAL, up_high REAL, up_low REAL, up_close REAL,
  down_open REAL, down_high REAL, down_low REAL, down_close REAL,
  computed_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_markets_series_resolved
  ON markets(asset, period, resolved, start_epoch);

-- ===== 业务库 data/app/app.sqlite =====

-- 用户（Auth.js 可复用；密码用 scrypt）
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  email_verified_at INTEGER,
  name TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user',      -- user | admin
  token_version INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE email_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  purpose TEXT NOT NULL,                  -- verify_email | reset_password
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

-- CSV 导出任务
CREATE TABLE export_jobs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  api_key_id TEXT,                        -- NULL=站内下载；非 NULL=外部 API 导出
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  status TEXT NOT NULL,                   -- queued|running|done|failed|canceled
  filters_json TEXT NOT NULL,
  format TEXT NOT NULL,                   -- csv|csv.gz
  file_path TEXT,
  rows INTEGER,
  bytes INTEGER,
  error TEXT,
  expires_at INTEGER
);

-- API Key（只存哈希；限额为 NULL 时继承套餐）
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  prefix TEXT NOT NULL,                   -- 展示用，如 pk_live_ab12
  key_hash TEXT NOT NULL UNIQUE,          -- SHA-256
  scopes TEXT NOT NULL,                   -- data:read,export:read
  rate_limit_per_min INTEGER,
  daily_request_quota INTEGER,
  daily_byte_quota INTEGER,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER,
  revoked_at INTEGER
);

-- 按 Key 的用量明细（用户级汇总在 usage_daily）
CREATE TABLE api_usage_daily (
  key_id TEXT NOT NULL,
  day TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  errors INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key_id, day)
) WITHOUT ROWID;

-- 策略与版本（用户私有）
CREATE TABLE strategies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  params_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  archived_at INTEGER
);

CREATE TABLE strategy_versions (
  strategy_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  source TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  params_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (strategy_id, version)
);

-- 回测任务（用户私有）
CREATE TABLE backtest_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  status TEXT NOT NULL,                   -- queued|running|done|failed|canceled
  progress REAL NOT NULL DEFAULT 0,
  strategy_id TEXT,
  strategy_version INTEGER,
  source_hash TEXT NOT NULL,
  config_json TEXT NOT NULL,
  summary_json TEXT,
  engine_version TEXT NOT NULL,
  data_cutoff INTEGER,
  error TEXT
);

CREATE TABLE backtest_trades (
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  slug TEXT NOT NULL,
  asset TEXT NOT NULL,
  period TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_ts INTEGER NOT NULL,
  entry_price REAL NOT NULL,
  shares REAL NOT NULL,
  stake REAL NOT NULL,
  exit_ts INTEGER,
  exit_price REAL,
  resolution TEXT,
  pnl REAL NOT NULL,
  return_pct REAL NOT NULL,
  PRIMARY KEY (run_id, seq)
) WITHOUT ROWID;

CREATE INDEX idx_export_jobs_user ON export_jobs(user_id, created_at);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_strategies_user ON strategies(user_id, archived_at);
CREATE INDEX idx_backtest_runs_user ON backtest_runs(user_id, created_at);
CREATE INDEX idx_backtest_trades_run_slug ON backtest_trades(run_id, slug);
```

### 5.3 查询层接口

新建 `src/server/query/`：

```ts
listAssets(): AssetInfo[]
listSeries(asset, period): SeriesInfo
listDays(asset, period): string[]
listMarkets(filters): Paged<MarketSummary>
getMarket(slug): MarketDetail | null
getSamples(slug, { from, to, limit, cursor }): Paged<Sample>
getChunkSamples(slugs, { minTs, maxTs }): Map<slug, Sample[]>   // 回测用
getCoverage(asset, period, from, to): Coverage
estimateExport(filters): { markets, rows, bytes }
```

- 现有 `dataset.ts` 逐步改为调用查询层，页面响应结构保持不变。
- 公共 API 的字段命名与站内不同（嵌套对象、cursor、ISO 时间），在路由层做映射。
- 查询层接收 `historyDays`（来自访问层级），统一把 `from` 截断到允许范围：匿名 7、Free 注册 30、Basic 365、Pro 730；不要只在前端隐藏日期，服务端必须强制。
- 站内 `/api/*` 根据 session 推导访问层级，`/api/v1/*` 根据 API Key 推导；两者共用同一套裁剪和限流逻辑，避免内部接口绕过付费墙。
- `series_days` / `market_stats` 在窗口 finalize 时增量更新；历史数据用一次性 backfill 脚本补齐。

### 5.4 数据质量规则

- 样本只取 `markets.start_epoch <= ts < end_epoch`。
- 回测默认只选 `resolved IN ('UP','DOWN')`。
- 可选 `minSamples`（如 5m 窗口至少 200 条）过滤采样缺口。
- 盘口有效性：`0 < bid/ask < 1`，且 `bid <= ask`；异常样本跳过并计数。
- 所有时间存储和返回 UTC；API 同时接受 epoch 秒和 ISO 8601。
- 每个 API/回测响应都带 `coverage`（窗口数、样本数、缺口、未结算数），让用户知道数据边界。

---

## 6. 数据下载

### 6.1 页面

路由 `/download`，加入侧边栏。**访问前提：登录 + 有效通行证**；历史范围由套餐决定（Basic 365 天 / Pro 730 天），每日导出字节数计入配额。筛选条件：

| 条件 | 说明 |
|---|---|
| 币种 | btc/eth/bnb/sol/doge/xrp/hype，多选 |
| 市场周期 | 5m/15m/1h/4h，多选 |
| 时间范围 | UTC 日期范围；快捷 24h / 7d / 30d / 90d / 自定义；超出套餐范围时提示升级 |
| 数据集 | `samples`（行情） / `markets`（窗口元数据） |
| 粒度 | `raw`（默认）/ 1s / 5s / 1m / 5m（服务端聚合） |
| 结算过滤 | 全部 / 仅已结算 |
| 格式 | `csv` / `csv.gz`（超过阈值自动 gzip） |

页面显示预估行数/大小、今日已用导出额度/剩余额度，并提供「小范围直接下载、大范围后台任务」两种路径。

### 6.2 CSV 结构

`samples` 默认每行自带窗口元数据，下载后可直接分析，不需要再 join：

```csv
slug,asset,period,window_start_utc,window_end_utc,resolved,ts,ts_utc,up_bid,up_ask,up_mid,up_last,down_bid,down_ask,down_mid,down_last
btc-updown-5m-1793545200,btc,5m,2026-11-01T17:20:00Z,2026-11-01T17:25:00Z,UP,1793545201,2026-11-01T17:20:01Z,0.51,0.52,0.515,0.51,0.48,0.49,0.485,0.49
```

`markets`：

```csv
slug,asset,period,start_epoch,end_epoch,start_utc,end_utc,title,resolved,finalized_at,condition_id,up_token,down_token
```

约定：

- UTF-8，带表头，RFC 4180 转义。
- 概率统一为 0–1，不做百分比。
- `ts` 为 Unix 秒；`*_utc` 为 ISO 8601。
- 空值写空字符串，不写 `NULL`/`NaN`。
- 数据字典写入 `docs/data-dictionary.md`。

### 6.3 直接下载 vs 后台任务

- **直接下载**：估算 ≤ 200 万行 / 300 MB 时，`GET /api/download?...` 流式返回，不落盘。
- **后台任务**：超过阈值时创建 `export_jobs`（带 `user_id`），由 jobs 进程按天/按窗口分块写入 `data/exports/<id>.csv.gz`。
- 创建任务前检查：通行证有效、历史范围在套餐内、今日导出额度足够、磁盘剩余空间足够。
- 文件保留按套餐：Basic 7 天，Pro 30 天；到期清理。
- 文件接口支持 HTTP Range（大文件断点续传），并校验文件属于当前用户。
- 生成文件名：`polyklines_btc_5m_2026-10-01_2026-10-31.csv.gz`。
- 导出时使用分块读取，避免把整个时间范围读进内存；读事务不要跨整个导出，防止 WAL 无法 checkpoint。
- 实际写出字节数累加到 `usage_daily.export_bytes`；失败任务不扣额度（系统错误）。

### 6.4 站内与外部

- 站内 `/api/download(s)` 要求登录会话 + 有效通行证，按用户 `user_id` 记额度和归属。
- 外部通过 `/api/v1/export` + API Key；Key 解析到 `user_id`，再按该用户的套餐限额计费。
- 两者复用同一个 `exportStream(filters)` 和 job 表；`export_jobs.api_key_id` 区分来源，`user_id` 用于归属和配额。
- 管理员可跨用户查看任务，但写审计日志。

---

## 7. 公共 API

### 7.1 版本与风格

- 前缀 `/api/v1`，版本写入 URL；破坏性变更升 `v2`。
- JSON 字段使用 camelCase；概率 0–1；时间同时给 `ts`（秒）和 ISO 字符串。
- 列表统一分页；错误统一结构。

```json
{
  "data": [],
  "pagination": { "limit": 500, "nextCursor": "...", "hasMore": true },
  "meta": { "generatedAt": "2026-11-02T00:00:00Z" }
}
```

错误：

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded.",
    "requestId": "..."
  }
}
```

### 7.2 鉴权与限流

- Header：`Authorization: Bearer pk_live_xxx` 或 `X-API-Key: pk_live_xxx`。
- Key 格式：`pk_live_` + 32 字节随机数（base64url），只在创建时显示一次。
- 数据库只存 SHA-256 哈希和前缀；比较使用 `timingSafeEqual`。
- Key 归属用户：`api_keys.user_id`；Key 本身不单独卖，继承用户当前套餐。
- 限额（默认由套餐决定，管理员可对单个 Key 覆盖）：
  - Basic：60 请求/分钟、10,000 请求/天、5 GB 导出/天、1 个 Key；
  - Pro：300 请求/分钟、100,000 请求/天、50 GB 导出/天、5 个 Key。
- 状态码：
  - `401`：无 Key / Key 无效 / 已吊销；
  - `402`：用户通行证过期或未激活；
  - `403`：超出套餐历史范围或功能未授权；
  - `429`：速率或日配额超限，返回 `Retry-After`。
- 响应头：`X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset`、`X-Plan`。
- 限流器先放内存（单实例），每日用量定期落 `usage_daily` 和 `api_usage_daily`，避免每请求写 SQLite。
- Key 管理：
  - 用户在 `/account/api-keys` 创建/吊销，只能看到自己的 Key；
  - 创建时校验套餐 Key 数量上限；
  - 管理员可通过 CLI `scripts/create-api-key.mjs` 代客创建/吊销，写审计日志。
- 所有 `/api/v1/*`（除 `health` 和公开的 `meta` 摘要）都走 `key → user → access_until → plan` 校验链。

### 7.3 端点

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/health` | 服务状态、数据库、磁盘、collector 心跳；无需 Key |
| GET | `/api/v1/meta` | 币种、周期、数据覆盖范围、样本总数；可匿名但按 IP 限流，不返回明细 |
| GET | `/api/v1/me` | 当前 Key 对应的用户、套餐、用量和剩余额度 |
| GET | `/api/v1/markets` | 窗口列表；`asset`、`period`、`from`、`to`、`resolved`、`minSamples`、`limit`、`cursor` |
| GET | `/api/v1/markets/{slug}` | 单个窗口元数据 + 覆盖情况 |
| GET | `/api/v1/markets/{slug}/samples` | 单窗口原始样本；`from`、`to`、`limit`、`cursor` |
| GET | `/api/v1/candles` | 跨窗口 OHLC；`asset`、`period`、`interval`（1m/5m/15m/1h）、`from`、`to` |
| GET | `/api/v1/coverage` | 按天的窗口数/样本数/未结算数/缺口 |
| GET | `/api/v1/export` | 直接 CSV 流；超过阈值返回 `413` 并提示用异步导出 |
| POST | `/api/v1/exports` | 创建异步导出任务 |
| GET | `/api/v1/exports/{id}` | 任务状态、行数、字节数、过期时间 |
| GET | `/api/v1/exports/{id}/file` | 下载文件，支持 Range |
| GET | `/api/v1/openapi.json` | OpenAPI 3.1 规范 |
| GET | `/api/docs` | 交互式文档页（Scalar/Redoc） |

所有明细端点都会按套餐截断历史范围：Basic 只允许最近 365 天，Pro 730 天；超出返回 `403 PLAN_HISTORY_LIMIT` 并附带当前套餐信息。月份/日期边界统一按 UTC。

示例：

```bash
curl -H "Authorization: Bearer $POLY_API_KEY" \
  "https://api.example.com/api/v1/markets?asset=btc&period=5m&from=2026-10-01&to=2026-10-07&resolved=UP&limit=100"
```

```json
{
  "data": [
    {
      "slug": "btc-updown-5m-1793545200",
      "asset": "btc",
      "period": "5m",
      "startEpoch": 1793545200,
      "endEpoch": 1793545500,
      "startUtc": "2026-11-01T17:20:00.000Z",
      "endUtc": "2026-11-01T17:25:00.000Z",
      "title": "Bitcoin Up or Down - ...",
      "resolved": "UP",
      "sampleCount": 300,
      "coverage": { "firstTs": 1793545201, "lastTs": 1793545500, "gapSeconds": 0 }
    }
  ],
  "pagination": { "limit": 100, "nextCursor": "eyJ0cyI6...", "hasMore": true }
}
```

### 7.4 分页、缓存、CORS

- Cursor 是 opaque base64（内部 `ts + slug` 或 `windowStart + slug`），不用 offset。
- `limit` 上限：markets 500，samples/candles 1000。
- 已结算历史数据：`Cache-Control: public, max-age=300, stale-while-revalidate=3600` + `ETag`。
- 正在交易的窗口：`Cache-Control: no-store`。
- CORS 通过 `POLY_API_CORS_ORIGINS` 配置，默认只允许 `GET/OPTIONS`，不携带 credentials。
- gzip：CSV/JSON 大响应使用压缩流；Nginx 层也开启 gzip。

### 7.5 文档与部署

- `docs/api.md` 作为人类文档；`/api/v1/openapi.json` 作为机器契约；`/api/docs` 交互式页面。
- 文档包含：鉴权、限流、分页、字段字典、时间约定、数据覆盖限制、示例（curl / Python / JS）、变更记录。
- 对外暴露：
  - 公开：营销页、`/markets`、`/pricing`、`/signin`、`/signup`、`/api/v1/health`、`/api/v1/meta`、`/api/docs`、OpenAPI、法务页；
  - 站内 `/api/meta|windows|klines` 对匿名开放，但只允许最近 7 天、只返回单窗口数据、按 IP 限流、禁止批量；免费注册可放宽到 30 天；
  - 完整历史、批量查询、CSV 导出走 `/api/v1/*` + API Key；内部接口不提供这些能力；
  - `/backtest` 允许登录用户进入（Free 仅内置示例 + 3 次试用）；`/download`、`/strategies`、`/account/api-keys` 需要 session + 有效通行证。
- Nginx：
  - 对 `/signin`、`/signup`、`/forgot-password` 做 IP 限速；
  - 对 `/api/*` 做连接数和请求速率兜底，尤其是匿名 `/api/klines`；
  - 只信任来自 Next 的转发头，正确设置 `X-Forwarded-*`。
- 免费 `/markets` 要防批量抓取：匿名近 7 天、单窗口查询、IP 限流、无导出；不要为了免费浏览把 2 年历史暴露在内部接口上。
- 域名 + HTTPS（Let's Encrypt）；当前 8080 安全组问题一并处理。

---

## 8. 回测

### 8.1 用户流程

```
选择币种 / 市场周期 / 时间范围
        ↓
选择或新建策略（JS 编辑器）
        ↓
设置参数、成本模型、仓位
        ↓
运行 → 进度 → 结果
        ↓
收益曲线 / 指标 / 按币种周期拆分 / 交易明细 / 导出 CSV
```

「时长」支持快捷选项 24h、7d、30d、90d、180d、自定义日期范围，最大受套餐历史范围和套餐单次范围限制。

访问前提与配额：

- 登录后可进入回测页；完整功能需要有效通行证。未登录跳转 `/signin`，无通行证可试用但不能保存/创建策略。
- Free 注册：3 次一次性试用，只能运行内置示例策略，不能保存/创建自定义策略；未登录不能运行回测。
- Basic（30 天通行证）：单次回测 ≤ 90 天、50 次/天、1 个并发、最多 50 个策略、结果保留 30 天。
- Pro（30 天通行证）：单次回测 ≤ 730 天、500 次/天、2 个并发、参数扫描、最多 500 个策略、结果保留 180 天。
- 页面顶部显示今日已用次数、剩余额度、当前套餐/到期日；达到上限时给出升级/续费入口。
- 所有策略和回测结果按 `user_id` 隔离，用户只能看到自己的策略、运行记录和交易明细。

### 8.2 策略契约

策略是单文件 JS，不提供 `require`/`import`/网络/文件系统。通过全局函数声明：

```js
// 默认参数；运行配置里的 params 会覆盖并作为 ctx.params 传入
const params = {
  minAsk: 0.55,
  maxAsk: 0.92,
  stake: 10,
};

// 模式一：point —— 只在指定时点决策一次，默认持有到结算
const meta = { mode: "point", decisionBeforeEnd: 60 };

function onWindow(ctx) {
  // ctx.latest 是决策时点的最新快照；ctx.samples 只包含决策时点之前的数据
  // ctx.market 不包含结算结果，防止策略偷看未来
  const snap = ctx.latest;
  if (!snap || snap.up.mid == null || snap.down.mid == null) return null;

  const side = snap.up.mid >= snap.down.mid ? "UP" : "DOWN";
  const ask = snap[side].ask;
  if (ask == null || ask < ctx.params.minAsk || ask > ctx.params.maxAsk) return null;

  return { action: "enter", side, stake: ctx.params.stake };
}
```

```js
// 模式二：stream —— 逐样本决策，可做止损/止盈
const meta = { mode: "stream" };

function onSample(ctx, sample) {
  if (!ctx.position) {
    if (sample.t - ctx.market.start >= 60 && sample.up.ask <= 0.60) {
      return { action: "enter", side: "UP", stake: 10 };
    }
    return null;
  }
  if (sample.down.ask >= 0.95) return { action: "exit" };
  return null;
}
```

数据上下文：

| 字段 | 说明 |
|---|---|
| `ctx.market` | `{ slug, asset, period, start, end }`，**不含 resolved** |
| `ctx.params` | 运行参数（合并默认值） |
| `ctx.latest` | point 模式决策时点快照 |
| `ctx.samples` | point 模式：决策时点之前的样本前缀 |
| `ctx.position` | stream 模式当前持仓 `{ side, entryTs, entryPrice, shares, stake }` |
| `sample` | `{ t, up:{bid,ask,mid,last}, down:{...} }` |
| `ctx.utils` | 只读工具函数（均值、标准差、clamp 等） |

硬性规则：

- **禁止未来数据**：point 模式只传决策时点之前的样本；stream 模式每次只传当前样本，完整数组只存在于沙箱包装层，用户代码拿不到。
- 一个窗口最多一个持仓；不允许加仓、做空、同时买两边。
- 结算由引擎完成，策略不能指定结算价。
- 策略代码最大 64 KB；参数 JSON 最大 16 KB。

### 8.3 执行与成本模型

| 项目 | 默认 | 说明 |
|---|---|---|
| 入场价 | UP/DOWN `ask` | taker 买入 |
| 出场价 | 对应 `bid` | 提前出场时 |
| 滑点 | 0.5 tick 或配置 bps | 可设 0 做理想化对比 |
| 手续费 | 0 bps | Polymarket 目前多数市场无交易费，可配置 |
| 成交 | 有有效 bid/ask 即成交 | 无订单簿深度，不做部分成交 |
| 跳过 | 盘口缺失/异常、spread 超限、到达窗口结束 | 计入 skipped 统计 |
| 结算 | 持仓到窗口结束，赢家每股 $1，输家 $0 | 依赖 `markets.resolved` |

资金：

- 默认固定金额 `stake`（例如每笔 $10）。
- 股数 = `stake / entry_price`；结算盈亏 = `shares * payout - stake`。
- 提前出场盈亏 = `shares * exit_price * (1 - fee) - stake`。
- 后续可增加固定股数、按资金比例、复利；MVP 只做固定金额。

### 8.4 指标

| 指标 | 定义 |
|---|---|
| trades / windows | 成交数 / 候选窗口数 |
| skipped | 未结算、缺样本、策略不交易、价格过滤、spread 超限等分类计数 |
| winRate | 盈利交易占比（含提前出场） |
| avgEntry | 平均入场价 |
| totalStaked / pnl / roi | 总投入、总盈亏、`pnl / totalStaked` |
| profitFactor | 总盈利 / 总亏损 |
| maxDrawdown | 累计盈亏曲线最大回撤 |
| sharpe / sortino | 按每笔收益率计算；文档注明非年化 |
| brier | `mean((entryPrice - outcome)^2)`，越低越好 |
| calibration | 按入场价分桶，比较实际胜率与价格 |
| edge | `winRate - avgEntry`，持有到结算时的近似优势 |
| byAsset / byPeriod / byDay | 分组统计 |
| benchmark | 同时点「买热门 / 买冷门」基线，便于对比 |

### 8.5 沙箱与任务

- 执行环境：**QuickJS（WASM）**，运行在独立的 jobs 进程内。
  - 不使用 `node:vm`（不是安全边界）。
  - QuickJS 只暴露标准 JS 和引擎提供的只读数据；无 `fetch`、无文件、无进程、无计时器。
  - 限制：源码 64 KB、内存 32 MB、单窗口 50 ms；Basic 单次回测 120 s、Pro 300 s；最大窗口数按套餐（Basic 30 万，Pro 200 万）；超限杀任务并记录错误。
  - 关闭 `Date.now` / `Math.random`，或注入固定种子，保证可复现。
- 策略存储：`strategies` + `strategy_versions`，带 `user_id`，默认私有；每次保存生成版本；回测记录 `source_hash` + `engine_version` + `data_cutoff`，保证结果可追溯。
- 策略权限：
  - 用户只能创建/编辑/删除自己的策略；
  - 管理员仅在滥用调查/内容审核时查看源码，必须写审计日志；
  - V1 不做策略市场/公开分享，避免代码泄露和版权问题。
- 编辑体验：
  - MVP：普通 textarea + 模板 + 语法错误行号 + “试运行 20 个窗口”校验。
  - 后续：CodeMirror 编辑器、参数表单、策略复制/归档。
- 任务：
  - `POST /api/backtest/runs` 要求 session；Free 仅允许内置示例 + 3 次一次性试用，Basic/Pro 还需有效通行证；创建时校验策略归属、历史范围、单次范围、每日次数、今日窗口预算和用户并发数；
  - jobs 进程按「Pro 优先、同套餐 FIFO」调度；全局并发 1–2，单用户不超过套餐并发；
  - `GET /api/backtest/runs/{id}` 轮询状态和进度，必须匹配 `user_id`；
  - `POST /api/backtest/runs/{id}/cancel` 取消；
  - 结果写 `backtest_runs.summary_json` 和 `backtest_trades`；按套餐保留 30/180 天，过期清理；
  - 交易明细可导出 CSV，导出也计入每日导出字节额度。
- 回测 API 只对站内开放，不进入 `/api/v1`，避免外部用户消耗 CPU；后续如果开放，必须先做队列、配额和计费。

### 8.6 结果页面

- 顶部：配置摘要、数据覆盖、跳过原因、运行耗时。
- 指标卡片：交易数、胜率、ROI、PnL、最大回撤、Brier、平均入场价。
- 图表：
  - 累计 PnL / 权益曲线；
  - 回撤曲线；
  - 按日 PnL 柱状图；
  - 入场价 vs 实际结果校准图；
  - 按币种/周期分组柱状图。
- 交易明细表：时间、slug（链接回 `/markets`）、方向、入场价、结算结果、PnL；支持分页和 CSV 导出。
- 运行历史：保存最近 N 次回测，可对比（V1.1）。

### 8.7 示例策略（随项目提供）

1. `favorite`：T-60s 买入价格更高的一侧，持有到结算。
2. `underdog`：T-60s 买入价格更低的一侧。
3. `momentum`：比较 T-120s 到 T-60s 的 UP 价格变化，顺势买入。
4. `threshold`：asks 在指定区间才买，否则跳过。
5. `stop-loss`：stream 模式，入场后回撤超过 X 或价格穿越阈值即出场。

---

## 9. 保留、磁盘与运维

### 9.1 延长保留期

- 将 `POLY_RETENTION_DAYS` 从 180 调到 **730**（2 年）或按磁盘能力设定。
- 预估：2 年约 70–75 GB；加上 WAL、索引、markets 表、导出文件和系统，建议 EBS 至少 **200 GB gp3**（预留增长和 VACUUM 余量）。
- 上线前：
  1. `df -h` 确认当前 EBS 容量；
  2. AWS 控制台创建快照，再扩容 EBS（在线扩容，不需要停机）；
  3. 服务器上 `growpart /dev/nvme0n1 <part>` + `resize2fs`（或 xfs_growfs）；
  4. 设置 retention 并重启 collector；
  5. 观察 24 小时 WAL、数据库增长和磁盘剩余；
  6. 配置 EBS 使用率/剩余空间告警。
- 磁盘成本纳入定价测算：200 GB gp3 约 $16/月（按区域略有差异），加上实例升级和支付费率，确保 $19 档有毛利。

### 9.2 磁盘保护

- 新增 `POLY_MIN_FREE_GB`（默认 20）。
- collector 写入前检查剩余空间；低于阈值停止写样本并记录 critical 日志，避免 SQLite 损坏。
- `/api/v1/health` 和总览页展示：磁盘总量/剩余、数据库大小、WAL 大小、样本总数、collector 心跳。
- 导出任务开始前检查剩余空间，拒绝超过可用空间的导出。

### 9.3 SQLite 维护

- 保持 WAL；设置 `wal_autocheckpoint`。
- 导出/回测按窗口分块读取，避免长读事务阻塞 checkpoint。
- 每周 `PRAGMA optimize`；定期 `PRAGMA wal_checkpoint(TRUNCATE)`。
- `VACUUM` 需要约 2 倍空间和停机时间，非必要不做；依赖 freelist 复用。
- 每日/每周 EBS 快照；`markets` 和 `stats` 很小，可单独每日备份。

### 9.4 jobs 进程

- 独立 systemd 服务 `polyklines-jobs.service`，与 Next 进程分离。
- 用 esbuild 把 `scripts/jobs.ts` 打包成 `dist/jobs.mjs`，随 `npm run build` 生成；部署时复制 `dist/`。
- 串行执行一个任务；设置 `--max-old-space-size=256` 和 QuickJS 内存上限。
- systemd 加固：`NoNewPrivileges=true`、`PrivateTmp=true`、`ProtectSystem=strict`、只允许写 `data/`。
- 每个任务执行前再次校验用户通行证、配额和资源归属；不能只依赖 API 层校验。
- 调度策略：全局并发 1–2；单用户不超过套餐并发；Pro 优先但设置最大连续占用，防止 Basic 用户永远排队。
- 如果后续任务量大，再拆成 export/backtest 两个 lane 或独立服务。

### 9.5 监控、备份与容量（收费产品）

- 应用监控：Sentry（或等价）捕获 Next/jobs 异常；结构化日志带 `requestId`/`userId`（不记录 Key、密码、支付信息）。
- 业务监控：
  - collector 心跳和采样缺口；
  - 磁盘剩余、WAL 大小、数据库增长；
  - jobs 队列长度、单任务耗时、失败率；
  - API 4xx/5xx、429、按套餐的请求量；
  - 通行证到期、待审核超时、异常付款/对账差异；
  - 登录失败、注册量、试用转化。
- 备份：
  - `data/app/app.sqlite` 小，每日备份并保留 30 天；
  - 行情库每日/每周 EBS 快照；每月做一次恢复演练；
  - 支付事件和发票以支付服务商为准，本地只存映射和审计。
- 可用性：
  - Uptime 监控 `/api/v1/health`；
  - systemd `Restart=always`；
  - 关键告警发邮件/Slack。
- 容量：
  - 上线前升级到 2 vCPU / 4 GB；
  - 按 DAU、回测次数、导出量做容量估算；
  - 用户增长后先加 jobs 进程/队列，再考虑拆分读库或换 Postgres。

### 9.6 单位经济（粗略）

| 项目 | 估算 |
|---|---|
| EC2 2 vCPU / 4 GB | $25–35/月 |
| EBS 200 GB gp3 | 约 $16/月 |
| 快照/带宽/邮件/域名 | $5–10/月 |
| 固定成本合计 | 约 $50/月 |
| 收款/出金成本 | 链上手续费由用户支付；换成法币时交易所/OTC 约 0.1%–1% |
| 人工审核成本 | 每笔约 2–5 分钟（核对 txid/金额/确认数） |
| Basic $19 到手 | 约 $18.8–$19.0（未扣出金和人工） |
| Pro $59 到手 | 约 $58.4–$59.0（未扣出金和人工） |

- 年付 8 折取整：Basic $180/年、Pro $560/年，能降低续费提醒和人工审核频率。
- 不接第三方网关，省掉 0.5%–1% 网关费，但增加人工审核和对账工作。
- 约 **3 个 Basic 用户** 覆盖基础基础设施成本（不含开发、审核、支持和退款）。
- 稳定币按 1:1 收款，不做汇率换算；仍需关注 USDT/USDC 脱钩风险和出金通道。
- 加密支付没有 chargeback，但退款只能人工处理；要预留客服时间。
- 试用转化率、续费率、退款率、待审核时长都要按 cohort 统计 LTV/CAC。
- 如果人工审核成为瓶颈，优先加链上自动校验，而不是直接加人。

---

## 10. 实施阶段

| 阶段 | 内容 | 交付物 | 预估 |
|---|---|---|---|
| **P0 数据底座** | 版本化迁移、`app.sqlite`、`series_days`/`market_stats`、查询层、backfill 脚本、EBS 扩容 | 三个功能共用的稳定取数层 | 2–3 天 |
| **P1 账户与数字支付** | 注册/登录/邮箱验证、会话、套餐表、`payment_wallets` 配置预留、支付开关、USDT/USDC 发票、二维码、txid 提交、后台确认台、通行证、付费墙、免费/注册浏览限额、用量页、定价页 | 可收费的账户与通行证闭环（地址/合约配置后即可启用） | 7–9 天 |
| **P2 CSV 下载** | CSV 流式导出、导出任务、`/download` 页面、配额与预估 | 付费用户可导出数据 | 2–3 天 |
| **P3 公共 API** | Key 归属用户/套餐、限流、v1 端点、分页、OpenAPI、文档页、Nginx/TLS | 外部可用历史数据 API | 3–5 天 |
| **P4 回测** | 用户策略存储/版本、QuickJS 沙箱、引擎、成本模型、指标、配额任务、回测页面 | 自定义 JS 回测全链路 | 6–9 天 |
| **P5 加固** | 沙箱安全测试、越权测试、限流/配额压测、监控、备份、法务页面 | 可长期运营的付费产品 | 3–5 天 |

合计约 **4.5–6 周**（单人估算）。建议顺序：P0 → P1 → P2 → P3 → P4 → P5。

实施进度（2026-11-02）：P0 代码已完成（迁移、`app.sqlite`、`series_days`/`market_stats`、查询层、回填脚本）；P1 账户/定价/支付配置/人工审核台骨架已完成（邮件发送、Google OAuth 待补；二维码和用量页已完成）；P2 CSV 直接下载、后台任务、配额和 `/download` 页面已完成（worker 暂在 Next 进程内）；P3 公共 API、API Key、限流、分页、OpenAPI 和文档页已完成；P4 自定义 JS 策略回测、QuickJS 沙箱、指标、策略保存、`/backtest` 页面以及累计 PnL/回撤图表已完成；P5 独立 jobs 服务、监控页/健康检查、自动备份、越权/限流 smoke test、Pro 参数扫描和运行中取消已完成并部署；EBS 扩容和 730 天保留仍待运维执行。

并行推进（不占开发工时但影响上线时间）：

- 确定 V1 收款网络、watch-only 收款地址、token contract/decimals，并用 TronLink/MetaMask/Trust Wallet/OKX Wallet 实测扫码；
- 确认运营主体所在地对加密支付、数据转售的合规要求；
- 核对 Polymarket 数据再分发条款；
- 准备服务条款、隐私政策、退款政策、加密支付说明、金融免责声明；
- 升级 EC2 内存和 EBS。

如果希望更早验证付费意愿，可以先做 **P0 + P1 + P2** 上线「付费数据下载」MVP，再补 API 和回测。

### 上线前检查清单

- [ ] 收款地址/二维码/txid 提交/后台确认/过期/少付/多付/退款全流程跑通
- [ ] `POLY_PAYMENTS_ENABLED=0` 或地址/合约未配置时，支付入口隐藏且发票 API 返回 409
- [ ] `.env.example` 和代码中没有真实地址/私钥；地址/合约只从配置读取
- [ ] 后台审核 SLA 12 小时、超时提醒、值班/时区安排就绪
- [ ] token contract、decimals、网络、收款地址全部核对；错误网络/代币提示清晰
- [ ] 运营主体所在地的加密支付与数据转售合规已确认
- [ ] 匿名 `/markets` 只显示近 7 天、按 IP 限流、无批量/导出
- [ ] 所有用户可见页面、邮件、错误提示、API 文档为英文
- [ ] 服务条款、隐私政策、退款政策、金融免责声明上线
- [ ] Polymarket 数据再分发条款已核对
- [ ] EC2 升到 2 vCPU / 4 GB，EBS 扩到 200 GB，磁盘告警配置
- [ ] 域名、HTTPS、邮件域名 SPF/DKIM/DMARC 配置完成
- [ ] `app.sqlite` 每日备份 + 行情库 EBS 快照 + 恢复演练
- [ ] 沙箱逃逸、越权（IDOR）、限流、配额、txid 唯一性测试通过
- [ ] 监控告警：健康检查、磁盘、采集心跳、队列、待审核超时/异常付款
- [ ] 定价/权益/试用配置与页面文案一致
- [ ] 支持邮箱、FAQ、状态页/公告渠道就绪

---

## 11. 验收标准

### 账户与通行证

- 未配置收款地址/合约或 `POLY_PAYMENTS_ENABLED=0` 时，定价页不展示可付款二维码，创建发票返回 `409 PAYMENT_NOT_CONFIGURED`，不会误开通。
- 用 fixture 配置启用后：注册 → 邮箱验证 → 登录 → 选择 Basic/Pro → 选择 USDT/USDC 网络 → 生成发票（地址/精确金额/30 分钟有效期/二维码）→ 付款 → 提交 txid → 后台 Approve → 通行证生效。
- 页面显示 QR、地址、网络、代币、精确金额、倒计时；错误网络/代币提示清晰。
- 至少在 TronLink / MetaMask / Trust Wallet / OKX Wallet 中实测：扫码能带出正确网络、代币和金额；不支持 URI 的钱包有清晰的文字回退。
- 管理员可在 `/admin/payments` 看到待确认发票，打开浏览器核对 txid/地址/合约/金额/确认数后 Approve 或 Reject。
- 同一 `(network, txid)` 不能重复开通；重复提交被拒绝。
- 少付/多付/过期/错误网络都有明确状态和处理方式；权益只加一次。
- 未登录访问 `/download`、`/backtest`、`/account` 跳转登录；登录但无通行证时，`/backtest` 可试用 3 次，`/download`、`/strategies`、`/account/api-keys` 跳转定价页。
- 通行证到期后自动回落到 Free：`/markets` 仍可用，回测/API/导出返回 402 或升级提示；不删除策略和数据。
- 提前续费从当前到期日叠加，不清空剩余时间。
- 年付 8 折取整价格正确：Basic $180 / 365 天、Pro $560 / 365 天；到期日按 365 天计算。
- 待审核页面显示 12 小时 SLA；超过 12 小时未处理触发管理员提醒。
- 用户 A 不能通过修改 URL 访问用户 B 的策略、回测、导出文件或 API Key（IDOR 测试）。
- 套餐限额（回测次数、导出字节、API 速率、Key 数量、历史范围）全部生效。
- 管理员的跨用户操作、手动开通、拒绝、退款有审计日志。

### 免费浏览

- 未登录访问 `/markets`，只显示最近 7 天；选择更早日期返回受限提示。
- 免费注册后显示最近 30 天。
- 匿名 `/api/klines` 只能查近期单窗口；按 IP 限流；不能批量拉取或导出。
- 付费用户登录后可见 365/730 天；同日期的数据在不同层级返回一致。
- 页面、空状态、错误提示、邮件全部为英文。

### 下载

- 选择 btc + 5m + 最近 7 天 + CSV，下载文件行数与数据库一致。
- 1 GB 级导出使用后台任务，服务内存不随文件大小增长。
- 任务状态、进度、过期清理、磁盘不足拒绝都可用。
- 超出套餐历史范围/今日导出额度时返回明确提示，不生成任务。
- 文件只能被所属用户和管理员下载。

### API

- 无 Key 返回 401；错误/吊销 Key 返回 401；通行证过期返回 402；超出套餐范围返回 403；超限返回 429。
- 分页不重不漏；`from/to` 边界与 UTC 日期一致。
- `/api/v1/export` 返回的 CSV 与站内下载一致。
- OpenAPI 文档可直接导入 Postman/Swagger。
- 内部 `/api/meta|windows|klines` 不能访问完整历史或批量导出；完整历史只能通过付费 API。
- Basic 创建第 2 个 Key 被拒绝；Pro 最多 5 个。
- `/api/v1/me` 返回的用量与 `usage_daily` 一致。

### 回测

- 粘贴示例策略，选择 btc + 5m + 30 天，能跑出指标和交易明细。
- 策略无法访问网络、文件系统、进程和环境变量。
- 死循环/内存爆炸被限额终止，任务标记失败，服务不受影响。
- 同一配置重复运行结果一致（`source_hash` + `data_cutoff` 相同）。
- 策略若尝试读取未来样本，拿不到数据；引擎不会使用未来信息成交。
- 未结算市场默认排除，并在 skipped 中计数。
- 用户只能看到自己的策略和回测；Basic 超过 50 次/天或 90 天范围被拒绝。
- Pro 的并发/优先队列生效，但不会导致全局过载。

### 保留

- `POLY_RETENTION_DAYS=730` 后旧数据不再被删除。
- 磁盘低于阈值时 collector 停止写入并告警，SQLite 不损坏。
- `app.sqlite` 可独立备份和恢复，恢复后用户/通行证/策略/任务关系完整。

---

## 12. 主要风险

| 风险 | 应对 |
|---|---|
| 自定义 JS 沙箱逃逸 | QuickJS + 独立进程 + systemd 加固 + 资源限额；不使用 `node:vm` |
| 回测偷看未来 | point 模式只传决策前缀；stream 模式只传当前样本；结算由引擎完成 |
| 2 年数据磁盘不足 | 扩容前先快照；磁盘阈值保护；导出前检查空间；200 GB gp3 起步 |
| 大导出拖垮 SQLite | 分块读、串行任务、避免长读事务、Range 下载 |
| 免费 `/markets` 被批量抓取 | 匿名只给近 7 天 + 按 IP 限流；内部接口不提供批量/导出；付费 API 才有完整历史 |
| Key 泄露 | 只存哈希、创建时显示一次、可吊销、按 Key/用户配额 |
| 回测性能 | point 模式索引点查；stream 模式按窗口读；最大窗口数限制 |
| 未结算/缺口污染结果 | 默认排除 UNKNOWN、minSamples、coverage 报告、skipped 统计 |
| 服务器内存不足 | 上线前升级 4 GB；jobs 独立进程；`--max-old-space-size`；一次一任务；QuickJS 32 MB 上限 |
| 人工确认出错/假 txid | 必须核对链上 txid/地址/合约/金额/确认数；不接受截图；大额双人复核；V2 再评估自动校验 |
| 错误网络/错误代币 | 二维码带 token contract；页面强提示；后台核对合约；错误转账人工跟进 |
| 重复 txid/重复开通 | `(network, txid)` 唯一索引；开通事务幂等；审计日志 |
| 收款地址/私钥安全 | watch-only/硬件钱包；服务器不存私钥；地址轮换与观察期 |
| 地址/合约未配置或配错 | 全局开关默认关闭；配置不完整返回 409；管理员二次确认 + 审计；fixture 测试 |
| 审核工作量/SLA | 后台待办列表 + 超时提醒；先人工，量大后加链上自动校验 |
| 对账差异 | 每日导出已批准发票与钱包流水核对；差异暂停开通并排查 |
| 数字货币合规风险 | 部分司法辖区限制加密支付；上线前咨询法律/税务，尤其是运营主体所在地 |
| 稳定币脱钩 | 只收 USDT/USDC 1:1，按 USD 定价；短有效期；出金通道预留备选 |
| Polymarket 数据转售条款 | 上线前核对上游条款，必要时取得授权或调整产品形态 |
| 多租户越权/IDOR | 所有查询带 `user_id`；统一 ownership helper；越权测试纳入验收 |
| 试用/发票滥用 | 邮箱验证、Turnstile、一次性试用额度、发票创建限流、按用户配额 |
| 认证漏洞 | 使用成熟库、scrypt、会话轮换、登录限流、管理员 MFA、审计 |
| 退款/税务/记账 | 加密支付不可撤销；明确退款政策；记录 USD/网络/代币/txid/审核人；会计/税务顾问确认 |
| 无自动续费导致流失 | 到期前 7/3/1 天提醒；提供年付折扣；续费流程尽量复用地址 |
| 付费用户负载导致超卖 | 套餐配额 + 全局队列 + 容量监控；按增长升级实例或拆 worker |
| 定价与成本倒挂 | 把 EBS、实例、人工审核、出金成本、退款率纳入 $19/$59 毛利测算 |

---

## 13. 待确认 / 后续决策

1. **收款地址与合约**：V1 网络已确认 **Tron TRC20 USDT + Base USDC + Polygon USDT/USDC**；地址/合约**暂不填写**，只预留字段、开关和管理员配置页。后续通过 `/admin/settings/payments` 填入并人工复核；BSC、Solana 放 V1.1。
2. **二维码兼容性**：V1 钱包测试 TronLink、MetaMask、Trust Wallet、OKX Wallet；需要实测扫码后能正确带出网络、代币和金额。
3. **后台审核流程**：已确认 V1 纯人工审核、SLA 12 小时；请确认大额双人复核阈值，以及 12 小时覆盖的时区/值班安排。V2 再评估链上自动校验。
4. **计费模式**：已确认预付 30/365 天、不自动续费；年付 8 折取整为 **$180 / $560**。
5. **免费层/试用**：是否按推荐执行「匿名 7 天、注册 30 天、3 次一次性回测试用」？还是取消试用、只保留免费 `/markets`？
6. **权益矩阵**：Basic $19 / Pro $59 的 30 天权益是否按推荐执行？尤其是历史范围 365 vs 730 天、API 请求量和导出额度。
7. **退款/税务**：加密支付不可撤销；退款政策按什么标准？是否已有会计/税务方案？
8. **合规**：Polymarket 数据再分发条款、加密支付在当地是否合法、是否需要 AML/KYC；这三项需要在上线前确认。
9. **域名与部署**：站点/API 用哪个域名；是否接受上线前把 EC2 升到 2 vCPU / 4 GB。
10. **回测结果对比**：V1 是否需要多策略/多参数网格对比；若需要，P4 增加参数扫描和热力图（Pro 专属）。
