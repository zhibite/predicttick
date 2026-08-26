# PredictTick 部署手册

部署目标: **Ubuntu 24.04 LTS + Node 20 + Next.js 16 + Caddy + systemd**

- 域名: `predicttick.com` (DNS 已解析)
- 应用: `/opt/predicttick/app`
- 数据: `/opt/predicttick/data` (由你 `rsync` 上传 ~42 GB SQLite)
- 日志: `/var/log/predicttick/`
- Next.js: `127.0.0.1:3000` (只绑本地, Caddy 反代 + 自动 HTTPS)

---

## 1. 服务器准备

```bash
# SSH 进新服务器
ssh root@predicttick.com   # 或 IP

# 创建普通用户 (可选, 脚本里的 service 已用系统用户 predicttick)
adduser deploy
usermod -aG sudo deploy
```

确保 80/443 端口未占用:

```bash
ss -tlnp | grep -E ':(80|443) '
```

---

## 2. 上传部署脚本

把整个项目 `rsync` 上传, 或只上传部署脚本:

```bash
# 方式 A: 整包上传 (推荐, 之后更新直接 git pull)
rsync -avz --exclude node_modules --exclude .next \
  D:/05.project2/10.polymarket/3.PredictTick/ \
  deploy@predicttick.com:/opt/predicttick/app/

# 方式 B: 只上传 deploy 目录
rsync -avz D:/05.project2/10.polymarket/3.PredictTick/scripts/deploy/ \
  deploy@predicttick.com:/tmp/deploy/
ssh deploy@predicttick.com 'sudo mkdir -p /opt/predicttick/scripts/deploy && sudo cp -r /tmp/deploy/* /opt/predicttick/scripts/deploy/ && sudo chmod +x /opt/predicttick/scripts/deploy/install.sh'
```

---

## 3. 一键安装

```bash
sudo bash /opt/predicttick/scripts/deploy/install.sh
# 或者直接在仓库根执行
sudo bash scripts/deploy/install.sh
```

脚本做了什么:

1. `apt install` —— Node 20, Caddy, build-essential, libsqlite3-dev (给 better-sqlite3 编 native), ufw, rsync
2. 建系统用户 `predicttick`
3. `git clone` 仓库 → `/opt/predicttick/app`
4. `npm ci` + `next build` (环境变量 `GMGN_DATA_DIR=/opt/predicttick/data`)
5. 写 `systemd` unit `/etc/systemd/system/predicttick.service`
6. 写 `/etc/caddy/Caddyfile` (自动 HTTPS via Let's Encrypt)
7. 写 `logrotate` 策略
8. 配置 UFW (开 SSH/80/443, 其余全挡)

> ⚠️ 脚本**只 install 不 start**, 让你先确认数据再启服务。

---

## 4. 上传 SQLite 数据

数据来自 `D:\05.project2\10.polymarket\8.gmgndata\data\` (~42 GB, `*.db`)。

### 一次性上传 (推荐首部署)

```bash
# Windows PowerShell / Git Bash
rsync -avz --progress --inplace --no-compress \
  "D:/05.project2/10.polymarket/8.gmgndata/data/" \
  "deploy@predicttick.com:/opt/predicttick/data/"

# 如有断点续传需求, 加 --partial
rsync -avz --progress --inplace --partial --no-compress \
  "D:/05.project2/10.polymarket/8.gmgndata/data/" \
  "deploy@predicttick.com:/opt/predicttick/data/"
```

> 42 GB 走 rsync 大概要 30~90 分钟, 视带宽而定。`--no-compress` 因为 `.db` 已压缩过。

### 周期性同步 (可选)

写个本地任务, 每 6 小时推一次增量:

```bash
# 本地 PowerShell 计划任务, 触发:
rsync -avz --progress --inplace \
  "D:/05.project2/10.polymarket/8.gmgndata/data/" \
  "deploy@predicttick.com:/opt/predicttick/data/"
```

服务器侧 `*.db` 在应用中是 **只读** 的, 可以直接覆盖。

---

## 5. 启动服务

```bash
# 1. 拉起 Caddy (它会向 Let's Encrypt 申请证书, 大约 30 秒)
sudo systemctl enable --now caddy
sudo systemctl status caddy --no-pager

# 2. 拉起 Next.js
sudo systemctl enable --now predicttick
sudo systemctl status predicttick --no-pager

# 3. 跟随日志看启动情况
sudo journalctl -u predicttick -f
sudo tail -f /var/log/predicttick/app.log
```

---

## 6. 验证

```bash
# 反代连通性
curl -I https://predicttick.com

# Next.js 自身健康
curl -s https://predicttick.com/api/polymarkets/health | jq

# 数据加载是否成功 (应返回 7 个资产)
curl -s https://predicttick.com/api/polymarkets/assets | jq

# 一条具体市场 (BTC 5m)
curl -s https://predicttick.com/api/polymarkets/markets/btc/5m | jq '.windows | length'
```

浏览器打开 https://predicttick.com 应该看到 Polymarket Monitor 主页。

---

## 7. 日常运维

| 操作 | 命令 |
|---|---|
| 看应用日志 | `journalctl -u predicttick -f` |
| 重启应用 | `sudo systemctl restart predicttick` |
| 重载 Caddy (改 Caddyfile 后) | `sudo systemctl reload caddy` |
| 拉取新代码并重新构建 | `cd /opt/predicttick/app && sudo -u predicttick git pull && sudo -u predicttick npm ci && sudo -u predicttick GMGN_DATA_DIR=/opt/predicttick/data npm run build && sudo systemctl restart predicttick` |
| 磁盘占用 | `du -sh /opt/predicttick/data /opt/predicttick/app` |
| 证书状态 | `sudo caddy list-certs` |

封装一个更新脚本:

```bash
cat > /usr/local/bin/predicttick-update <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
APP=/opt/predicttick/app
DATA=/opt/predicttick/data
sudo -u predicttick git -C "$APP" pull --ff-only
cd "$APP"
sudo -u predicttick npm ci --no-audit --no-fund
sudo -u predicttick GMGN_DATA_DIR="$DATA" npm run build
sudo systemctl restart predicttick
echo "[update] restarted @ $(date -Is)"
EOF
sudo chmod +x /usr/local/bin/predicttick-update
```

之后 `predicttick-update` 一条搞定。

---

## 8. 故障排查

| 现象 | 排查 |
|---|---|
| `predicttick.service` 起不来 | `journalctl -u predicttick -e` 看 stacktrace |
| `better-sqlite3` 找不到 | 缺 `python3 build-essential libsqlite3-dev`, 重装后再 `npm rebuild better-sqlite3` |
| `/api/polymarkets/health` 200 但 `assets=[]` | `ls -la /opt/predicttick/data` 看是否上传成功 |
| 域名访问 502 | Next.js 还没启, 或端口被占: `ss -tlnp | grep 3000` |
| HTTPS 证书失败 | 80 端口要先能访问, 让 Caddy 完成 ACME 挑战: `curl -I http://predicttick.com/.well-known/acme-challenge/test` |
| SQLite 报 "database is locked" | 当前是只读, 检查是否有多进程写入了 |

---

## 9. 环境变量

集中在 `/etc/predicttick/predicttick.env`:

```bash
sudo nano /etc/predicttick/predicttick.env
```

```env
GMGN_DATA_DIR=/opt/predicttick/data
NODE_ENV=production
```

改完: `sudo systemctl restart predicttick`。
