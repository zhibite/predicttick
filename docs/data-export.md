# CSV 数据导出（P2）

## 访问与配额

| 套餐 | 历史范围 | 每日导出 | 文件保留 |
|---|---|---|---|
| Basic | 365 天 | 5 GB | 7 天 |
| Pro | 730 天 | 50 GB | 30 天 |
| 管理员 | 730 天 | 50 GB | 30 天 |

- `/download` 需要登录 + 有效通行证；未登录由 `proxy.ts` 跳转 `/signin`，免费用户跳转 `/pricing`。
- 预计大小超过当日剩余额度时，估算和建任务都会返回 `429 EXPORT_QUOTA_EXCEEDED`。
- 选择超出套餐历史范围的起始日期会返回 `403 HISTORY_LIMIT`。

## 页面

`/download`：

- 币种、周期、UTC 日期范围
- 数据集：samples / markets
- 抽样间隔：raw / 5s / 1m / 5m（samples；取每个时间桶的最后一条）
- 是否只导出已结算窗口
- 后台任务格式：csv / csv.gz

页面上的估算来自 `series_days` 聚合，不会扫描全量样本。

## 直接下载 vs 后台任务

- 直接下载：预计 ≤ 2,000,000 行且 ≤ 300 MB；`GET /api/download` 流式返回 CSV。
- 后台任务：超过阈值或选择 gzip；写入 `data/exports/<job-id>.csv[.gz]`。
- 文件接口支持 HTTP Range（断点续传）。
- 任务完成时记录实际行数/字节数，并计入当日导出配额；直接下载在流结束时计入。
- 文件按套餐保留 7/30 天，worker 每次 tick 清理过期文件。

## CSV 结构

`samples`：

```csv
slug,asset,period,window_start_utc,window_end_utc,resolved,ts,ts_utc,up_bid,up_ask,up_mid,up_last,down_bid,down_ask,down_mid,down_last
```

`markets`：

```csv
slug,asset,period,start_epoch,end_epoch,start_utc,end_utc,title,resolved,finalized_at,condition_id,up_token,down_token
```

约定：

- UTF-8，带表头，RFC 4180 转义；
- 概率 0–1；
- `ts` / `start_epoch` 为 Unix 秒，`*_utc` 为 ISO 8601；
- 空值为空字符串；
- 抽样间隔模式使用每个桶的最后一条样本，不做 OHLC 重采样。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/download/estimate` | 估算行数/字节数、配额和历史范围 |
| GET | `/api/download` | 直接流式 CSV（有额度/大小限制） |
| GET | `/api/downloads` | 当前用户的导出任务 |
| POST | `/api/downloads` | 创建后台导出任务 |
| GET | `/api/downloads/{id}/file` | 下载文件，支持 Range |

所有接口都要求登录 Cookie；下载权限在服务端校验，不依赖页面隐藏。

## 导出 worker

当前 P2 的 worker 运行在 Next 进程内（`src/server/export/worker.ts`），每 3 秒处理一个 queued 任务：

```bash
POLY_EXPORT_WORKER=1   # 默认启用；0 表示只建任务不处理
POLY_EXPORT_DIR=...    # 默认 data/exports
```

这是 P2 的折中方案。P5 加固阶段应改为独立 systemd jobs 进程，避免大导出和回测争用 Next 事件循环。

## 已知限制

- 直接下载只返回 CSV；需要 gzip 请用后台任务。
- 估算基于 `series_days`，刚采集的当天可能略有低估；实际行数以 CSV 为准。
- 抽样间隔不是 OHLC；如果后续需要 K 线格式，增加 `dataset=candles`。
- 多币种/多周期一次导出尚未实现；当前一次一个 asset + period。
