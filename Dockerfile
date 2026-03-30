FROM node:22.21.1-alpine3.22 AS builder
WORKDIR /app

# pnpm
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
# RUN pnpm install --frozen-lockfile --registry=https://registry.npmmirror.com
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build


FROM node:22.21.1-alpine3.22 AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV TZ=Asia/Shanghai

COPY --from=builder /app/.output ./
COPY --from=builder /app/prisma/generated ./prisma/generated
COPY --from=builder /app/prisma/migrations ./prisma/migrations

# ENV DATABASE_MODE=postgre

ENV DATABASE_URL="postgresql://postgres:123456@localhost:5432/cashbook5?schema=public"

# production, development
ENV NODE_ENV="development" 
ENV NUXT_APP_VERSION="5.1.2"
ENV NUXT_DATA_PATH="/app/data"
ENV NUXT_AUTH_SECRET="auth123"

ENV PORT="9090"

VOLUME /app/data/

EXPOSE 9090

CMD ["node", "/app/server/index.mjs"]
