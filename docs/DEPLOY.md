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

# /var/lib/tare holds the post ledger — what the social poster has already
# published. Outside the checkout on purpose: `git pull` must not be able to
# reach it, or a redeploy could repost a recap or reset the X monthly count.
mkdir -p /var/www /var/log/tare /var/lib/tare/social
git clone https://github.com/fourtisf/teradata.git /var/www/tare
cd /var/www/tare
git checkout main

cat > .env.local <<'ENV'
DATA_SOURCE=sim
NEXT_PUBLIC_SITE_URL=https://taredata.com
SIM_SEED=1296520521
ENV

# `npm ci` without --omit=dev on purpose: the social poster runs through tsx,
# which is a devDependency. Pinned in the lockfile rather than fetched by npx at
# boot, so a restart cannot pull a different version than the one tested.
npm ci
npm run build

pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u root --hp /root   # run the line it prints
pm2 list
```

Two processes come up: **tare** (the site) and **tare-social** (the scheduled
poster). The poster publishes nothing while `DATA_SOURCE=sim` — it says so in
its first ten lines of log and stays up so the schedule can be watched.

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
pm2 reload tare-social
pm2 list
```

`pm2 reload tare-social` is safe at any hour. The ledger is on disk and outside
the checkout, so a reload mid-window does not repost what has already gone out
and does not lose the month's X count.

## Checks

```bash
pm2 list
pm2 logs tare --lines 50
curl -I https://taredata.com
curl -s https://taredata.com/robots.txt        # Disallow: / while DATA_SOURCE=sim
curl -sI https://taredata.com/opengraph-image  # image/png
```

## The scheduled poster

```bash
pm2 logs tare-social --lines 40

cd /var/www/tare
npm run social:check                # the clock, the ledger, the budget, the guard
npm run social:preview              # what the last fortnight would have posted

# What would go out at the next firing, without waiting for midnight and
# without sending anything.
npm run social -- --once --dry-run --at "$(date -u -d 'tomorrow 00:06' +%Y-%m-%dT%H:%M:%SZ)"

# What has actually been published, newest last.
tail -5 /var/lib/tare/social/posts-$(date -u +%Y-%m).ndjson

# X posts spent this calendar month, against the 500 allowance.
grep -c '"channel":"x".*"ok":true' /var/lib/tare/social/posts-$(date -u +%Y-%m).ndjson
```

### The bot's webhook

Separate from the poster, and it needs the site to be up on HTTPS first —
Telegram will not register a webhook it cannot reach.

```bash
cd /var/www/tare
npm run telegram:webhook -- --info     # what is registered now
npm run telegram:webhook -- --set      # points it at NEXT_PUBLIC_SITE_URL
```

`--info` reports `last error` when Telegram's deliveries are failing, which is
the first place to look if the bot has gone quiet. There is one webhook per bot
token, so setting it from anywhere else takes it away from here.

Bringing the feed up one channel at a time is a line in `.env.local`:
`SOCIAL_CHANNELS=telegram` posts the recaps to Telegram only, which is the
recoverable channel. Add `x` once the copy has been read on a real screen.

`robots.txt` disallowing everything is correct and deliberate while the figures
are simulated. Flip `DATA_SOURCE=live` in `.env.local` only when the indexer is
actually running — the app throws rather than serving numbers it cannot stand
behind, so the site will 500 until P1 exists.
