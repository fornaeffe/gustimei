# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
RUN npm run build

FROM base AS production-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM base AS app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 SHUTDOWN_TIMEOUT=30
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/check-database-migrations.mjs ./scripts/check-database-migrations.mjs
COPY package.json package-lock.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:3000/api/health/live').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]

# The operations image is deliberately separate: migrations and local rehearsals need build tooling,
# while the public web image does not. Phase 9 publishes both with immutable digests.
FROM build AS ops
ENV NODE_ENV=production
CMD ["npm", "run", "deployment:validate"]
