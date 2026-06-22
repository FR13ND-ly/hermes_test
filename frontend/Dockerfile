# Stage 1: Build Angular cu SSR
FROM node:22-alpine AS builder

WORKDIR /app

# Copiem pachetele pentru instalarea dependințelor
COPY package*.json ./

# Instalăm dependințele curate
RUN npm ci

# Copiem restul fișierelor proiectului (tailwind, angular.json etc.)
COPY . .

# Build de producție (generează folderele browser + server)
RUN npm run build -- --configuration=production


# Stage 2: Serverul Node SSR (servește SSR + proxy /api -> backend)
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Permite host-ul venit prin Traefik. '*' = orice host; pune domeniul tău
# (ex. test.parapet-software.work) dacă vrei mai strict.
ENV NG_ALLOWED_HOSTS=*

# Header-ele de proxy de încredere (scot warning-urile x-forwarded din SSR).
ENV NG_TRUST_PROXY_HEADERS=x-forwarded-for,x-forwarded-host,x-forwarded-proto,x-forwarded-port

# IMPORTANT: în Hermes setează BACKEND_URL către serviciul backend, ex:
#   http://hermes-app-backend-main-<hash>:<port>
# Default-ul localhost:3000 e doar pentru dezvoltare locală.
ENV BACKEND_URL=http://localhost:3000

COPY --from=builder /app/dist/frontend/ ./dist/frontend/

# Portul serverului Node SSR (neschimbat — nu trebuie modificat nimic în Hermes)
EXPOSE 4000

CMD ["node", "dist/frontend/server/server.mjs"]
