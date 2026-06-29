FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml .yarnrc.yml ./
RUN pnpm install --frozen-lockfile

FROM deps AS runtime
COPY . .
EXPOSE 8000
# The storefront needs the Medusa publishable key, which is only available once the
# backend is up. "build" fetches it from /key-exchange and bakes it into the Next.js
# build, so build + start both have to run at container start, not at image-build time.
CMD ["sh", "-c", "pnpm run build && pnpm start"]
