# Stage 1: Build Angular with SSR
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./

# Install clean dependencies
RUN npm ci

# Copy the rest of the project files (tailwind, angular.json etc.)
COPY . .

# Production build (generates browser + server folders)
RUN npm run build -- --configuration=production


# Stage 2: Node SSR server (serves SSR + proxy /api -> backend)
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Allow any host coming through Traefik. '*' = any host; set your domain
# (e.g. test.parapet-software.work) for stricter control.
ENV NG_ALLOWED_HOSTS=*

# Trusted proxy headers (suppresses x-forwarded warnings from SSR).
ENV NG_TRUST_PROXY_HEADERS=x-forwarded-for,x-forwarded-host,x-forwarded-proto,x-forwarded-port

# IMPORTANT: in Hermes set BACKEND_URL to the backend service, e.g.:
#   http://hermes-app-backend-main-<hash>:<port>
# The localhost:3000 default is for local development only.
ENV BACKEND_URL=http://localhost:3000

COPY --from=builder /app/dist/frontend/ ./dist/frontend/

# Node SSR server port (unchanged — nothing to modify in Hermes)
EXPOSE 4000

CMD ["node", "dist/frontend/server/server.mjs"]
