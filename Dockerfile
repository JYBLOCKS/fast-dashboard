FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=3030
ENV HOST=0.0.0.0
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/server.mjs ./server.mjs
COPY --from=build /app/dist ./dist
COPY --from=build /app/data ./data
RUN chown -R app:app /app
USER app
EXPOSE 3030
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3030/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
