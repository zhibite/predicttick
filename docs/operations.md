# 运维与加固（P5）

## 进程结构

```
polyklines.service        Next.js + collector + 页面/API
polyklines-jobs.service   独立导出/回测 worker（含 QuickJS）
polyklines-backup.timer   每日 SQLite 备份
```

`instrumentation.ts` 默认**不再启动**导出/回测 worker；只有设置
`POLY_INLINE_WORKERS=1` 才会在 Next 进程内启动，适合本地开发。

## 独立 jobs 服务

构建：

```bash
npm run build        # next build + dist/jobs.mjs
# 或单独
npm run build:jobs
```

安装：

```bash
sudo cp deploy/systemd/polyklines-jobs.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now polyklines-jobs
sudo journalctl -u polyklines-jobs -f
```

服务使用：

```bash
WorkingDirectory=/home/ubuntu/polyklines
ExecStart=/usr/bin/node dist/jobs.mjs
```

环境变量：

- `POLY_DB_PATH`
- `POLY_APP_DB_PATH`
- `POLY_EXPORT_WORKER=1`
- `POLY_BACKTEST_WORKER=1`

QuickJS 通过 `serverExternalPackages` 外置，部署时需要把
`node_modules/quickjs-emscripten*` 和 `node_modules/@jitl/*` 一起复制到服务器。

## 监控

- `GET /api/health`：collector/jobs 心跳、队列、磁盘剩余；`degraded` 时仍返回 200，`critical` 返回 503。
- `/admin/system`：管理员页面，展示 collector、jobs worker、队列、磁盘、数据库大小和最近失败任务。
- `job_worker_status` 表：jobs 进程每 3 秒写心跳、pid、最近错误。

## 自动备份

```bash
node scripts/backup.mjs
```

- 使用 `VACUUM INTO` 生成一致性快照，再 gzip 压缩。
- 默认目录：`data/backups`；服务器建议 `/home/ubuntu/polyklines-backups`。
- 保留：app 14 份，market 7 份，可用环境变量调整。
- systemd timer：`deploy/systemd/polyklines-backup.timer`，每天 03:15 UTC。
- 市场库持续增长后，每日全量备份会变大；届时改为每周 market 备份 + 每日 app 备份，或使用 EBS 快照。

安装：

```bash
sudo cp deploy/systemd/polyklines-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now polyklines-backup.timer
sudo systemctl start polyklines-backup.service
```

## 越权/限流压测

```bash
BASE_URL=http://127.0.0.1:3112 \
APP_DB_PATH=data/test-p5/app.sqlite \
TEST_FROM=2026-10-31 TEST_TO=2026-11-01 \
node scripts/security-smoke.mjs
```

覆盖：

- 用户 B 读取/修改/删除用户 A 的策略 → 404
- 用户 B 读取用户 A 的回测 → 404
- 用户 B 撤销用户 A 的 API Key → 404
- 单 Key 限流触发 429
- `/api/v1/health` 50 并发无失败，输出 p50/p95

不要在生产库上跑这个脚本，它会创建测试用户和策略。

## 参数扫描与取消

- 参数扫描：`POST /api/backtest/sweeps`，Pro/管理员，最多 20 个组合；组合作为独立 runs 排队，`/backtest` 页面有 Pro 扫描面板。
- 运行取消：`POST /api/backtest/runs/{id}/cancel`；queued 立即取消，running 设置 `cancel_requested`，worker 每 10 个窗口检查一次。
- 取消不会退还当日回测次数。

## 仍然待办

- EBS 扩容到 ~200GB 后再把 `POLY_RETENTION_DAYS` 从 180 调到 730。
- 邮件发送（SES/Resend）和 Google OAuth 需要外部凭据。
- 法务页面需要人工审核。
