#!/usr/bin/env bash
#
# First deploy and redeploy, for an Ubuntu VPS. Safe to re-run.
#
#   curl -fsSL https://raw.githubusercontent.com/fourtisf/teradata/main/deploy/setup.sh | bash
#
# Deliberately not pasted as loose lines: a multi-line paste into a terminal
# can be swallowed by whatever command happens to read stdin first, and half a
# deploy is worse than none.
set -euo pipefail

REPO="${REPO:-https://github.com/fourtisf/teradata.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/var/www/tare}"
DOMAIN="${DOMAIN:-taredata.com}"

step() { printf '\n\033[1;35m==> %s\033[0m\n' "$1"; }

[ "$(id -u)" -eq 0 ] || { echo "Run as root."; exit 1; }

step "Packages"
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y nginx certbot python3-certbot-nginx git
command -v pm2 >/dev/null || npm install -g pm2
node -v && npm -v && pm2 -v

step "Swap"
# A 1GB box OOMs part-way through building 43 pages and leaves a broken .next.
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
free -h

step "Source"
mkdir -p /var/log/tare "$(dirname "$APP_DIR")"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch origin "$BRANCH"
  git -C "$APP_DIR" checkout "$BRANCH"
  git -C "$APP_DIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
git -C "$APP_DIR" --no-pager log --oneline -1

step "Environment"
# NEXT_PUBLIC_* is inlined at build time, so this has to exist before the build
# and a change to it needs a rebuild, not a restart.
if [ ! -f "$APP_DIR/.env.local" ]; then
  cat > "$APP_DIR/.env.local" <<ENV
DATA_SOURCE=sim
NEXT_PUBLIC_SITE_URL=https://$DOMAIN
SIM_SEED=1296520521
ENV
fi
cat "$APP_DIR/.env.local"

step "Build"
cd "$APP_DIR"
npm ci
npm run build

step "PM2"
if pm2 describe tare >/dev/null 2>&1; then
  pm2 reload tare --update-env
else
  pm2 start "$APP_DIR/ecosystem.config.cjs"
fi
pm2 save
pm2 list

step "nginx"
cp "$APP_DIR/deploy/nginx-tare.conf" /etc/nginx/sites-available/tare
sed -i "s/taredata\.com/$DOMAIN/g" /etc/nginx/sites-available/tare
ln -sf /etc/nginx/sites-available/tare /etc/nginx/sites-enabled/tare
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

step "Check"
curl -sS -o /dev/null -w 'local next  : %{http_code}\n' http://127.0.0.1:3000/
curl -sS -o /dev/null -w 'through nginx: %{http_code}\n' -H "Host: $DOMAIN" http://127.0.0.1/

cat <<NEXT

Done. Two things left, both interactive so they are not run for you:

  1. TLS
     certbot --nginx -d $DOMAIN -d www.$DOMAIN --redirect --agree-tos -m you@example.com

  2. Survive a reboot
     pm2 startup systemd -u root --hp /root
     ...then run the single line it prints back.

  Firewall, if ufw is in use:
     ufw allow 'Nginx Full' && ufw allow OpenSSH && ufw --force enable

  robots.txt disallows everything on purpose while DATA_SOURCE=sim. Leave it
  that way until the indexer is real.
NEXT
