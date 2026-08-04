/**
 * PM2 process definition.
 *
 * Runs Next's own binary rather than `npm start`. Under `pm2 start npm -- start`
 * PM2 supervises npm, npm spawns next, and signals stop one process short — so
 * `pm2 reload` leaves an orphaned server holding the port. Pointing at the
 * binary means PM2 manages the process that actually serves traffic.
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
  ],
};
