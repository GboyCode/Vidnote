module.exports = {
  apps: [{
    name: 'vidnotes-api',
    script: './api/server.js',
    cwd: '/www/wwwroot/vidnotes.mrgrl.com',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3002
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};