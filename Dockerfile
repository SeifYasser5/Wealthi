# The public demo: the API and the built frontend in one container, serving a
# synthetic ledger rebuilt from backend/demo on every start (src/demo/). It never
# sees a real chat.db or config: .dockerignore keeps backend/config and
# backend/data out of the build, and the ENV below points the app at backend/demo.
# Not for your own data — that runs locally (README, Running it).
FROM node:22-bookworm-slim

# Prisma's CLI (db push, below) needs OpenSSL, which the slim image leaves out.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
# npm 10's arborist crashes on this tree, and allowScripts needs npm 11.
RUN npm install -g npm@11

WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

COPY . .
RUN cd backend && npx prisma generate && npm run build \
 && cd ../frontend && npm run build

ENV NODE_ENV=production \
    TZ=UTC \
    HOST=0.0.0.0 \
    WEALTHI_DEMO=true \
    WEALTHI_CONFIG_PATH=/app/backend/demo/wealthi.demo.json \
    WEALTHI_PATTERNS_DIR=/app/backend/demo/patterns \
    WEALTHI_STATIC_DIR=/app/frontend/dist

WORKDIR /app/backend
# The demo database is disposable and rebuilt on every start, so the schema is
# pushed as-is (no migration history, AGENTS.md → Database).
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && exec node dist/server.js"]
