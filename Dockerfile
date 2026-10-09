FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN npm install --global corepack@0.34.0 && corepack enable && corepack prepare pnpm@10.22.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN npm install --global corepack@0.34.0 && corepack enable && corepack prepare pnpm@10.22.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["sh", "-c", "node dist/server/migrate.js && node dist/server/seed-local-user.js && node dist/server/index.js"]
