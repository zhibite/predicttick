# 账户、通行证与支付（P1）

## 环境变量

```bash
POLY_APP_DB_PATH=data/app/app.sqlite
POLY_APP_URL=http://localhost:3000
POLY_REQUIRE_EMAIL_VERIFICATION=0
POLY_EMAIL_DEV_LOG=1
POLY_ADMIN_EMAILS=
POLY_PAYMENTS_ENABLED=0
```

- `POLY_REQUIRE_EMAIL_VERIFICATION=1` 时，未验证邮箱不能登录。V1 还没有接邮件服务，先保持 0。
- 开发环境会把验证/重置链接打印到服务端日志（`[email:verify_email] ...`）。
- 生产环境接入 SES/Resend 后，把验证开关打开。
- `POLY_ADMIN_EMAILS` 是注册时自动提升为管理员的邮箱列表；生产环境更推荐下面的 CLI。

## 创建管理员

```bash
POLY_ADMIN_EMAIL=you@example.com \
POLY_ADMIN_PASSWORD='至少 8 位密码' \
npm run create-admin
```

脚本会创建或提升用户为 `admin`，并把邮箱标记为已验证；同时清理旧会话。

## 页面

| 路径 | 访问 | 说明 |
|---|---|---|
| `/signup` | 公开 | 邮箱密码注册；默认自动登录 |
| `/signin` | 公开 | 登录；`?next=` 支持回跳 |
| `/forgot-password` | 公开 | 请求重置链接 |
| `/reset-password?token=` | 公开 | 设置新密码，旧会话全部失效 |
| `/verify-email?token=` | 公开 | 验证邮箱 |
| `/pricing` | 公开 | Basic/Pro 30/365 天价格 |
| `/account` | 登录 | 账户、套餐、到期日 |
| `/account/billing` | 登录 | 创建发票、查看发票和状态 |
| `/account/api-keys` | 登录 + 有效通行证 | 创建/撤销 API Key |
| `/account/usage` | 登录 | API/导出/回测用量 |
| `/download` | 登录 + 有效通行证 | CSV 导出 |
| `/api/docs` | 公开 | 公共 API 文档 |
| `/admin` | 管理员 | 管理入口 |
| `/admin/payments` | 管理员 | 人工审核发票 |
| `/admin/settings/payments` | 管理员 | 配置收款地址/合约/开关 |

## 支付配置（当前留空）

`payment_wallets` 已预置 4 条空记录：

- Tron TRC20 USDT
- Base USDC
- Polygon USDT
- Polygon USDC

地址、token contract、decimals 都为空，`active=0`。在
`/admin/settings/payments` 填入并启用后，还必须设置：

```bash
POLY_PAYMENTS_ENABLED=1
```

并重启服务，支付入口才会出现。

保存时服务端会校验：

- Tron 地址/合约格式（T 开头、34 位）；
- EVM 地址/合约格式（0x + 40 hex）；
- decimals 0–18；
- 启用网络时地址/合约/decimals 必须完整。

## 人工审核

1. 用户创建发票，得到地址、精确金额、30 分钟有效期。
2. 用户付款后回填 txid。
3. 管理员在 `/admin/payments` 打开 Tronscan/Basescan/Polygonscan 核对：
   - txid 存在；
   - 收款地址、token contract、金额正确；
   - 确认数达到阈值；
   - txid 未被其他发票使用。
4. Approve 后延长 `user_access.access_until`，同一发票不能重复开通；Reject 写原因。

审核 SLA 按产品约定为 12 小时；后台页面显示该目标，超时需人工巡检。

## 已知限制 / 下一步

- Google OAuth 尚未接入（需要 Google Client ID/Secret）。
- 邮件发送尚未接入 SES/Resend，目前只写日志。
- `proxy.ts` 只检查会话 Cookie 是否存在；角色校验在服务端页面/API 内完成。非管理员访问 `/admin` 会在浏览器端被服务端重定向，但不会泄露数据。
- `/backtest`、`/download`、`/account/api-keys`、`/account/usage` 已实现；策略管理目前合并在 `/backtest` 页面，独立 `/strategies` 页面尚未拆出。
- 收款二维码已接入：TRC20 显示地址二维码，EVM 使用 EIP-681 URI。
- `/terms`、`/privacy`、`/refund` 目前是英文占位文本，上线前必须由法律/税务顾问审核，并替换 `support@polyklines.example`。
