/**
 * PM2 process definitions.
 *
 * Two processes: the site, and the scheduled poster. Both run Next's or tsx's
 * own binary rather than `npm start`. Under `pm2 start npm -- start` PM2
 * supervises npm, npm spawns the real process, and signals stop one short — so
 * `pm2 reload` leaves an orphan holding the port. Pointing at the binary means
 * PM2 manages the process that actually does the work.
 */
module.exports = {
  apps: [
    {
      name: "tare",
      cwd: "/var/www/tare",
      script: "node_modules/next/dist/bin/next",
      args: "start --port 3000 --hostname 127.0.0.1",
      exec_mode: "fork",
      instances: 1,
      // Next already uses the machine; a second instance would just contend for
      // it and double the memory. Scale with a second VPS, not a second fork.
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      out_file: "/var/log/tare/out.log",
      error_file: "/var/log/tare/error.log",
      merge_logs: true,
      time: true,
    },
    {
      /**
       * The scheduled poster — §P5's daily card and the weekly recap, on a
       * clock. The reactive alerts still arrive over `/api/alerts/dispatch`
       * inside the app above; this process is what publishes on a quiet day.
       *
       * Next reads `.env.local` itself; a bare node process does not, so the
       * credentials are loaded explicitly. `--env-file-if-exists` rather than
       * `--env-file`: a box without the file should start and say it is not
       * configured, not refuse to boot.
       */
      name: "tare-social",
      cwd: "/var/www/tare",
      script: "node_modules/.bin/tsx",
      args: "--env-file-if-exists=.env.local --tsconfig tsconfig.json scripts/social-bot.mts",
      exec_mode: "fork",
      // One, and this one matters more than the site's. The ledger dedupes
      // across processes, but two instances ticking the same second can both
      // read "not yet posted" before either writes — and the result is the
      // same recap twice on a public timeline.
      instances: 1,
      autorestart: true,
      // A crash loop here would be one that cannot reach the provider or the
      // config. Ten seconds between attempts keeps the log readable.
      restart_delay: 10_000,
      max_memory_restart: "256M",
      env: {
        NODE_ENV: "production",
        // Outside the checkout: `git pull` should not be able to touch the
        // record of what has already been published.
        SOCIAL_LEDGER_DIR: "/var/lib/tare/social",
      },
      out_file: "/var/log/tare/social-out.log",
      error_file: "/var/log/tare/social-error.log",
      merge_logs: true,
      time: true,
    },
  ],
};
