#!/usr/bin/env bash
# PredictTick one-shot deploy script
# Tested on Ubuntu 24.04 LTS (clean install)
#
# What it does:
#   1. Install OS deps (Node 20, build tools for better-sqlite3, Caddy, rsync)
#   2. Create app dirs under /opt/predicttick
#   3. Clone repo into /opt/predicttick/app
#   4. npm ci + build (with GMGN_DATA_DIR pointing at /opt/predicttick/data)
#   5. Install systemd unit (predicttick.service) + Caddyfile
#   6. Enable services (NOT start; we let you validate first)
#
# Re-run safe: every step is idempotent.

set -euo pipefail

#----------------------------------------------------------------------------------
# Config
#----------------------------------------------------------------------------------
APP_USER="predicttick"
APP_DIR="/opt/predicttick"
APP_CODE_DIR="${APP_DIR}/app"
DATA_DIR="${APP_DIR}/data"
LOG_DIR="/var/log/predicttick"
REPO_URL="${REPO_URL:-https://github.com/zhibite/predicttick.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
DOMAIN="${DOMAIN:-predicttick.com}"
NODE_MAJOR="20"

#----------------------------------------------------------------------------------
# Helpers
#----------------------------------------------------------------------------------
log()  { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
fail() { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    fail "Please run as root: sudo bash $0"
  fi
}

#----------------------------------------------------------------------------------
# Step 1: OS packages
#----------------------------------------------------------------------------------
install_os_deps() {
  log "Updating apt..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y --no-install-recommends \
    ca-certificates curl gnupg ufw rsync git \
    python3 build-essential pkg-config libsqlite3-dev \
    apt-transport-https

  # Node.js 20.x from NodeSource
  if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "${NODE_MAJOR}" ]]; then
    log "Installing Node.js ${NODE_MAJOR}.x..."
    curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
    apt-get install -y nodejs
  else
    log "Node $(node -v) already present"
  fi

  # Caddy from official repo (stable, with automatic HTTPS)
  if ! command -v caddy >/dev/null 2>&1; then
    log "Installing Caddy..."
    curl -fsSL "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/caddy-stable-archive-keyring.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq
    apt-get install -y caddy
  else
    log "Caddy $(caddy version) already present"
  fi
}

#----------------------------------------------------------------------------------
# Step 2: App user / dirs
#----------------------------------------------------------------------------------
setup_dirs_and_user() {
  log "Creating app user '${APP_USER}' and directories..."
  if ! id -u "${APP_USER}" >/dev/null 2>&1; then
    adduser --system --group --home "${APP_DIR}" --shell /bin/bash "${APP_USER}"
  fi
  mkdir -p "${APP_CODE_DIR}" "${DATA_DIR}" "${LOG_DIR}"
  chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}" "${LOG_DIR}"
  # Data dir is intended to be rsynced-in; keep app user readable
  chmod 755 "${DATA_DIR}"
}

#----------------------------------------------------------------------------------
# Step 3: Code
#----------------------------------------------------------------------------------
fetch_code() {
  log "Fetching code from ${REPO_URL} (branch=${REPO_BRANCH})..."
  if [[ -d "${APP_CODE_DIR}/.git" ]]; then
    sudo -u "${APP_USER}" git -C "${APP_CODE_DIR}" fetch --prune origin
    sudo -u "${APP_USER}" git -C "${APP_CODE_DIR}" reset --hard "origin/${REPO_BRANCH}"
  else
    rm -rf "${APP_CODE_DIR}"
    sudo -u "${APP_USER}" git clone --branch "${REPO_BRANCH}" --depth 1 "${REPO_URL}" "${APP_CODE_DIR}"
  fi
}

#----------------------------------------------------------------------------------
# Step 4: Build
#----------------------------------------------------------------------------------
build_app() {
  log "Installing deps + building Next.js..."
  sudo -u "${APP_USER}" bash -lc "
    set -euo pipefail
    cd '${APP_CODE_DIR}'
    npm ci --no-audit --no-fund
    GMGN_DATA_DIR='${DATA_DIR}' npm run build
  "
}

#----------------------------------------------------------------------------------
# Step 5: system units
#----------------------------------------------------------------------------------
write_systemd_unit() {
  log "Writing systemd unit..."
  cat > /etc/systemd/system/predicttick.service <<EOF
[Unit]
Description=PredictTick (Next.js)
After=network.target

[Service]
Type=simple
User=${APP_USER}
Group=${APP_USER}
WorkingDirectory=${APP_CODE_DIR}
EnvironmentFile=-/etc/predicttick/predicttick.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=127.0.0.1
ExecStart=/usr/bin/node node_modules/next/dist/bin/next start -H 127.0.0.1 -p 3000
Restart=on-failure
RestartSec=3

# Hardening
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${APP_CODE_DIR} ${LOG_DIR} ${DATA_DIR}

StandardOutput=append:${LOG_DIR}/app.log
StandardError=append:${LOG_DIR}/app.log
SyslogIdentifier=predicttick

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
}

write_env_file() {
  log "Writing /etc/predicttick/predicttick.env..."
  mkdir -p /etc/predicttick
  cat > /etc/predicttick/predicttick.env <<EOF
# PredictTick environment
GMGN_DATA_DIR=${DATA_DIR}
NODE_ENV=production
EOF
  chmod 640 /etc/predicttick/predicttick.env
  chown root:${APP_USER} /etc/predicttick/predicttick.env
}

write_caddyfile() {
  log "Writing Caddyfile for ${DOMAIN}..."
  cat > /etc/caddy/Caddyfile <<EOF
# PredictTick reverse proxy
${DOMAIN}, www.${DOMAIN} {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    # Static + Next.js assets get long cache
    @assets path /_next/static/* /favicon.ico /images/*
    header @assets Cache-Control "public, max-age=31536000, immutable"

    log {
        output file ${LOG_DIR}/caddy-access.log {
            roll_size 100mb
            roll_keep 5
        }
    }
}
EOF
  # Remove the default "welcome" site if present
  rm -f /etc/caddy/sites-enabled/caddy /etc/caddy/Caddyfile.bak 2>/dev/null || true
  caddy validate --config /etc/caddy/Caddyfile
}

write_logrotate() {
  cat > /etc/logrotate.d/predicttick <<EOF
${LOG_DIR}/*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    copytruncate
    sharedscripts
    postrotate
        systemctl reload caddy >/dev/null 2>&1 || true
    endscript
}
EOF
}

write_firewall_rules() {
  log "Configuring UFW (SSH + 80/443)..."
  ufw --force reset
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw --force enable
}

#----------------------------------------------------------------------------------
# Main
#----------------------------------------------------------------------------------
main() {
  require_root
  install_os_deps
  setup_dirs_and_user
  fetch_code
  build_app
  write_env_file
  write_systemd_unit
  write_caddyfile
  write_logrotate
  write_firewall_rules

  log ""
  log "=============================================================="
  log "  Install complete."
  log "  Next steps:"
  log "    1) Sync data:"
  log "         rsync -avz --progress \\\\"
  log "           'D:\\\\05.project2\\\\10.polymarket\\\\8.gmgndata\\\\data/' \\\\"
  log "           'root@${DOMAIN}:${DATA_DIR}/'"
  log "       (or use any other method that puts *.db files there)"
  log ""
  log "    2) Start services:"
  log "         systemctl enable --now caddy"
  log "         systemctl enable --now predicttick"
  log ""
  log "    3) Verify:"
  log "         curl -I https://${DOMAIN}"
  log "         curl -s https://${DOMAIN}/api/polymarkets/health"
  log "=============================================================="
}

main "$@"
