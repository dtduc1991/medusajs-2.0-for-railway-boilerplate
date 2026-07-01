FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc .yarnrc.yml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# "medusa build" loads medusa-config.js, which requires DATABASE_URL/JWT_SECRET/COOKIE_SECRET
# to be set (see backend/src/lib/constants.ts). Railway only injects service variables into
# the runtime container, not the "docker build" step, so they must be declared as ARGs here -
# Railway auto-populates ARGs that share a name with a service variable.
ARG DATABASE_URL
ARG JWT_SECRET
ARG COOKIE_SECRET
ENV DATABASE_URL=$DATABASE_URL
ENV JWT_SECRET=$JWT_SECRET
ENV COOKIE_SECRET=$COOKIE_SECRET
RUN pnpm build

# "pnpm start" runs "init-backend && cd .medusa/server && medusa start", so the
# runtime image needs the full build output (root node_modules for the launch-utils
# CLI, plus .medusa/server which postBuild.js already installed prod deps into).
FROM build AS runtime
ENV NODE_ENV=production
EXPOSE 9000
CMD ["pnpm", "start"]
