module.exports = {
  apps: [
    {
      name: "demonic-process-manager",
      script: "./process-manager.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
        HEALTH_PORT: 3000
      }
    }
  ]
};
