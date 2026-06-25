# Node 22-slim for production bot
FROM node:22-slim

# Run as non-root for security
RUN groupadd -r bot && useradd -r -g bot bot

WORKDIR /app

# Install only production deps
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy source
COPY src ./src

# Persistent data directory (mount a volume here in production)
RUN mkdir -p /app/data && chown -R bot:bot /app
VOLUME ["/app/data"]
ENV DB_PATH=/app/data/db.json

# Drop privileges
USER bot

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PORT+'/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "src/index.js"]
