Quick deployment for DEMONIC Bot

Docker (recommended):

Build image:

```bash
docker build -t demonic-bot:latest .
```

Run container (publish health port 3000):

```bash
docker run -d --name demonic-bot -p 3000:3000 \
  -v $(pwd)/session:/usr/src/app/session \
  -v $(pwd)/logs:/usr/src/app/logs \
  --restart unless-stopped \
  demonic-bot:latest
```

PM2 (local / VPS):

Install pm2 globally:

```bash
npm install -g pm2
pm2 start ecosystem.config.js --env production
pm2 save
pm2 monit
```

Notes:
- Persist the `session` folder and `logs` volume so WhatsApp auth persists across restarts.
- Configure `HEALTH_PORT` env if you need a different health endpoint port.
- Avoid running on serverless platforms; Baileys requires a long-lived WebSocket and persistent session files.
