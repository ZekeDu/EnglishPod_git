module.exports = {
  apps: [
    {
      name: 'englishpod-api',
      script: 'scripts/ops/pm2-api.sh',
      interpreter: 'bash',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      kill_timeout: 5000,
      max_restarts: 10,
      restart_delay: 1000,
    },
    {
      name: 'englishpod-web',
      script: 'scripts/ops/pm2-web.sh',
      interpreter: 'bash',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      kill_timeout: 8000,
      max_restarts: 10,
      restart_delay: 1000,
    },
  ],
};

