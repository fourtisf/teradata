# Deploying to the VPS

Ubuntu, PM2 behind nginx, Let's Encrypt. `taredata.com` already resolves to the
box (A `@`, CNAME `www`).

## The one thing that bites

`NEXT_PUBLIC_*` values are **inlined at build time**, not read at boot. Write
`.env.local` *before* `npm run build`, and rebuild after changing any of them.
Editing the file and restarting PM2 changes nothing.

`DATA_SOURCE` is server-side and is read at runtime, so that one only needs a
restart.

## First deploy

```bash
ssh root@31.97.57.242

# Node 22 (Next 16 needs >= 20.9), pm2, nginx, certbot
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs nginx certbot python3-certbot-nginx git
npm install -g pm2

# A 1GB box will OOM building 43 pages. Swap costs nothing and prevents it.
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

mkdir -p /var/www /var/log/tare
git clone https://github.com/fourtisf/teradata.git /var/www/tare
cd /var/www/tare
git checkout main

cat > .env.local <<'ENV'
DATA_SOURCE=sim
NEXT_PUBLIC_SITE_URL=https://taredata.com
SIM_SEED=1296520521
ENV

npm ci
npm run build

pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root   # run the line it prints
pm2 list
```

## nginx

```bash
cat > /etc/nginx/sites-available/tare <<'CONF'
server {
    listen 80;
    server_name taredata.com www.taredata.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        # Upgrade/Connection are for the P1 websocket feed. Harmless now, and
        # one less thing to remember when the live stream lands.
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    # Immutable build assets. Everything else is ISR and nginx must not cache it.
    location /_next/static/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
CONF

ln -sf /etc/nginx/sites-available/tare /etc/nginx/sites-enabled/tare
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

ufw allow 'Nginx Full' && ufw allow OpenSSH && ufw --force enable

certbot --nginx -d taredata.com -d www.taredata.com --redirect --agree-tos -m you@example.com
```

## Redeploy

```bash
cd /var/www/tare
git pull origin main
npm ci
npm run build
pm2 reload tare
pm2 list
```

## Checks

```bash
pm2 list
pm2 logs tare --lines 50
curl -I https://taredata.com
curl -s https://taredata.com/robots.txt        # Disallow: / while DATA_SOURCE=sim
curl -sI https://taredata.com/opengraph-image  # image/png
```

`robots.txt` disallowing everything is correct and deliberate while the figures
are simulated. Flip `DATA_SOURCE=live` in `.env.local` only when the indexer is
actually running — the app throws rather than serving numbers it cannot stand
behind, so the site will 500 until P1 exists.
