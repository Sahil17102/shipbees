module.exports = {
  apps: [
    {
      name: 'shipray-backend',
      cwd: '/srv/shipray/current/backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 5003,
      },
    },
  ],
}
