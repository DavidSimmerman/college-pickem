# Two stages so the runtime image carries the build output and production deps only.
FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# SvelteKit reads DATABASE_URL at runtime, not build time; a placeholder keeps the
# module-level guard in db.ts happy while vite prerenders.
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
RUN pnpm build && pnpm prune --prod

FROM node:24-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
# adapter-node listens here; Coolify maps its proxy to it.
EXPOSE 3000
ENV PORT=3000 HOST=0.0.0.0
# Not root: nothing in here needs to write to the image.
USER node
CMD ["node", "build"]
