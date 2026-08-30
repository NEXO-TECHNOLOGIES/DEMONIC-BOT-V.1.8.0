FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

ENV NODE_ENV=production

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production || npm install --only=production

# Install PM2 runtime
RUN npm install -g pm2@5

# Bundle app source
COPY . .

# Expose health port (default 3000)
EXPOSE 3000

# Use pm2-runtime to keep the process manager supervised
CMD ["pm2-runtime", "ecosystem.config.js", "--env", "production"]
