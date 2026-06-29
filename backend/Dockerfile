FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc .yarnrc.yml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

# "pnpm start" runs "init-backend && cd .medusa/server && medusa start", so the
# runtime image needs the full build output (root node_modules for the launch-utils
# CLI, plus .medusa/server which postBuild.js already installed prod deps into).
FROM build AS runtime
ENV NODE_ENV=production
EXPOSE 9000
CMD ["pnpm", "start"]
