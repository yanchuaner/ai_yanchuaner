FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS deps
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/ai-web/package.json apps/ai-web/package.json
RUN pnpm install --frozen-lockfile

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS builder
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate
COPY --from=deps /workspace/node_modules ./node_modules
COPY --from=deps /workspace/apps/ai-web/node_modules ./apps/ai-web/node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_STANDALONE=true
ENV AI_WEB_PUBLIC_URL=https://ai.example.invalid
ENV AI_WEB_SESSION_SECRET=build-only-session-secret-0123456789
ENV AI_WEB_ALLOW_INSECURE_INTERNAL_HTTP=false
ENV YANCORE_OIDC_ISSUER=https://identity.example.invalid
ENV YANCORE_OIDC_DISCOVERY_URL=https://identity.example.invalid/api/oauth/.well-known/openid-configuration
ENV YANCORE_OIDC_CLIENT_ID=build-only
ENV YANCORE_OIDC_CLIENT_SECRET=build-only-client-secret
ENV YANCORE_API_BASE_URL=https://api.example.invalid
ENV YANCORE_SUBJECT_EXCHANGE_CLIENT_ID=build-only
ENV YANCORE_SUBJECT_EXCHANGE_CLIENT_SECRET=build-only-exchange-secret-0123456789
RUN pnpm --filter @yanchuaner/ai-web build

FROM node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3 AS runner
WORKDIR /workspace
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/ai-web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /workspace/apps/ai-web/.next/static ./apps/ai-web/.next/static
USER nextjs
EXPOSE 3001
CMD ["node", "apps/ai-web/server.js"]
