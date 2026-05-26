#!/usr/bin/env bash
set -euo pipefail

# VoxBridge one-shot installer for Ubuntu 24.04
# - Installs deps
# - Deploys app to /opt/voxbridge
# - Creates .env
# - Runs as systemd service
# - Configures Nginx reverse proxy + WebSockets
# - Issues Let's Encrypt SSL (certbot)
# - Locks firewall (UFW)

if [[ "${EUID}" -ne 0 ]]; then
  echo "❌ Τρέξε το script ως root: sudo bash install.sh"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_APP_DIR="${SCRIPT_DIR}/app"
CFG_DIR="${SCRIPT_DIR}/configs"

APP_USER="voxbridge"
APP_GROUP="voxbridge"
APP_DIR="/opt/voxbridge"
APP_PORT="8000"

# Run a command as APP_USER without depending on sudo being installed
    run_as_app_user() {
      if command -v runuser >/dev/null 2>&1; then
        runuser -u "${APP_USER}" -- "$@"
      elif command -v sudo >/dev/null 2>&1; then
        sudo -u "${APP_USER}" -- "$@"
      else
        # Fallback: build a safely-quoted command string for su
        local cmd=""
        local arg
        for arg in "$@"; do
          cmd+=$(printf '%q ' "$arg")
        done
        su -s /bin/bash "${APP_USER}" -c "${cmd}"
      fi
    }

DEFAULT_DOMAIN_ROOT="intervoxai.com"
DEFAULT_DOMAIN_WWW="www.intervoxai.com"

DOMAIN_ROOT="${DOMAIN_ROOT:-}"
DOMAIN_WWW="${DOMAIN_WWW:-}"
LE_EMAIL="${LETSENCRYPT_EMAIL:-}"
OPENAI_KEY="${OPENAI_API_KEY:-}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-}"
SESSION_SECRET="${SESSION_SECRET:-}"

echo "=============================="
echo " VoxBridge Production Installer"
echo "=============================="
echo ""

# Prompt only if missing
if [[ -z "${DOMAIN_ROOT}" ]]; then
  read -rp "Domain (root) [${DEFAULT_DOMAIN_ROOT}]: " DOMAIN_ROOT
  DOMAIN_ROOT="${DOMAIN_ROOT:-$DEFAULT_DOMAIN_ROOT}"
fi
if [[ -z "${DOMAIN_WWW}" ]]; then
  read -rp "Domain (www)  [${DEFAULT_DOMAIN_WWW}]: " DOMAIN_WWW
  DOMAIN_WWW="${DOMAIN_WWW:-$DEFAULT_DOMAIN_WWW}"
fi
if [[ -z "${LE_EMAIL}" ]]; then
  read -rp "Email για Let's Encrypt (π.χ. admin@${DOMAIN_ROOT}): " LE_EMAIL
fi
if [[ -z "${OPENAI_KEY}" ]]; then
  read -rp "OPENAI_API_KEY (θα μπει στο /opt/voxbridge/.env): " OPENAI_KEY
fi
if [[ -z "${PUBLIC_BASE_URL}" ]]; then
  read -rp "PUBLIC_BASE_URL [https://${DOMAIN_ROOT}]: " PUBLIC_BASE_URL
  PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://${DOMAIN_ROOT}}"
fi

# Session secret auto-generate if empty
if [[ -z "${SESSION_SECRET}" ]]; then
  SESSION_SECRET="$(openssl rand -hex 32)"
fi

echo ""
echo "➡️ Ρυθμίσεις:"
echo "  - DOMAIN_ROOT:     ${DOMAIN_ROOT}"
echo "  - DOMAIN_WWW:      ${DOMAIN_WWW}"
echo "  - PUBLIC_BASE_URL: ${PUBLIC_BASE_URL}"
echo "  - APP_DIR:         ${APP_DIR}"
echo ""

# Basic sanity
if [[ ! -d "${SRC_APP_DIR}" ]]; then
  echo "❌ Δεν βρέθηκε ο φάκελος app/ δίπλα στο install.sh"
  exit 1
fi

# --- Install packages ---
export DEBIAN_FRONTEND=noninteractive
echo "📦 Installing system packages..."
apt update
apt -y upgrade
apt -y install nginx unzip ufw curl ca-certificates \
  python3-venv python3-pip \
  ffmpeg libsndfile1 libportaudio2 portaudio19-dev build-essential python3-dev \
  certbot python3-certbot-nginx dnsutils

systemctl enable --now nginx

# --- Create user ---
if ! id "${APP_USER}" >/dev/null 2>&1; then
  echo "👤 Creating system user ${APP_USER}..."
  adduser --system --group "${APP_USER}"
fi

# --- Deploy app files ---
echo "📁 Deploying app to ${APP_DIR}..."
mkdir -p "${APP_DIR}"
chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"

# Backup existing
if [[ -f "${APP_DIR}/api/server.py" ]]; then
  TS="$(date +%Y%m%d_%H%M%S)"
  echo "⚠️ Existing install detected. Backing up to /opt/voxbridge_backup_${TS}"
  cp -a "${APP_DIR}" "/opt/voxbridge_backup_${TS}"
fi

# Preserve existing web_media (users, history, mp3) if present
KEEP_MEDIA_DIR=""
if [[ -d "${APP_DIR}/web_media" ]]; then
  KEEP_MEDIA_DIR="/tmp/voxbridge_web_media_keep_$(date +%s)"
  mkdir -p "${KEEP_MEDIA_DIR}"
  cp -a "${APP_DIR}/web_media/." "${KEEP_MEDIA_DIR}/" || true
fi

# Copy fresh app (code/config/static) – WITHOUT losing web_media
rm -rf "${APP_DIR:?}/"* || true
cp -a "${SRC_APP_DIR}/." "${APP_DIR}/"
mkdir -p "${APP_DIR}/web_media"
if [[ -n "${KEEP_MEDIA_DIR}" ]]; then
  cp -a "${KEEP_MEDIA_DIR}/." "${APP_DIR}/web_media/" || true
fi

chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"

# --- Python venv + deps ---
echo "🐍 Creating venv + installing requirements..."
run_as_app_user python3 -m venv "${APP_DIR}/venv"
run_as_app_user "${APP_DIR}/venv/bin/pip" install -U pip
run_as_app_user "${APP_DIR}/venv/bin/pip" install -r "${APP_DIR}/requirements.txt"

# --- .env ---
echo "🔐 Writing ${APP_DIR}/.env ..."
cat > "${APP_DIR}/.env" <<EOF
OPENAI_API_KEY=${OPENAI_KEY}

OPENAI_TTS_VOICE=cedar
OPENAI_STT_MODEL=gpt-4o-mini-transcribe
OPENAI_TTS_MODEL=gpt-4o-mini-tts
OPENAI_TRANSLATE_MODEL=gpt-5-mini

PUBLIC_BASE_URL=${PUBLIC_BASE_URL}

SESSION_SECRET=${SESSION_SECRET}
EOF

chown "${APP_USER}:${APP_GROUP}" "${APP_DIR}/.env"
chmod 640 "${APP_DIR}/.env"

# --- systemd service ---
echo "🧩 Installing systemd unit..."
install -m 0644 "${CFG_DIR}/voxbridge.service" /etc/systemd/system/voxbridge.service
systemctl daemon-reload
systemctl enable --now voxbridge

echo "✅ Service started. Checking health locally..."
set +e
curl -s "http://127.0.0.1:${APP_PORT}/health" | head -c 200
echo ""
set -e

# --- Nginx site ---
echo "🌐 Configuring Nginx reverse proxy..."
NGINX_SITE="/etc/nginx/sites-available/voxbridge"
sed \
  -e "s/{{DOMAIN_ROOT}}/${DOMAIN_ROOT}/g" \
  -e "s/{{DOMAIN_WWW}}/${DOMAIN_WWW}/g" \
  "${CFG_DIR}/nginx_voxbridge.conf" > "${NGINX_SITE}"

ln -sf "${NGINX_SITE}" /etc/nginx/sites-enabled/voxbridge
rm -f /etc/nginx/sites-enabled/default || true

nginx -t
systemctl reload nginx

# --- Firewall ---
echo "🛡️ Enabling firewall (UFW) - only SSH + 80/443..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

# --- SSL ---
echo "🔒 Issuing SSL certificate with Let's Encrypt..."
echo "   (ΠΡΟΣΟΧΗ: Πρέπει να έχεις ήδη βάλει DNS A-records προς το IP του VPS)"
set +e
certbot --nginx \
  -m "${LE_EMAIL}" --agree-tos --no-eff-email --redirect --non-interactive \
  -d "${DOMAIN_ROOT}" -d "${DOMAIN_WWW}"
CERTBOT_RC=$?
set -e

if [[ "${CERTBOT_RC}" -ne 0 ]]; then
  echo ""
  echo "⚠️ Το certbot απέτυχε (συνήθως επειδή δεν έχει 'δει' ακόμη το DNS ή δεν δείχνει στο σωστό IP)."
  echo "   Μόλις στρώσει το DNS, τρέξε ξανά:"
  echo "     sudo certbot --nginx -d ${DOMAIN_ROOT} -d ${DOMAIN_WWW}"
  echo ""
else
  echo "✅ SSL installed."
fi

echo ""
echo "=============================="
echo " ✅ ΟΛΟΚΛΗΡΩΘΗΚΕ"
echo "=============================="
echo "Τελικό URL:"
echo "  https://${DOMAIN_ROOT}/app"
echo ""
echo "Χρήσιμες εντολές:"
echo "  sudo systemctl status voxbridge --no-pager"
echo "  sudo systemctl restart voxbridge"
echo "  sudo journalctl -u voxbridge -f"
echo ""
echo "Nginx:"
echo "  sudo nginx -t"
echo "  sudo systemctl reload nginx"
echo ""
echo "SSL renew test:"
echo "  sudo certbot renew --dry-run"
echo ""
