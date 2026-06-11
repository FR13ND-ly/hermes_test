# Stage 1: Build local pentru Angular cu SSR
FROM node:20-alpine AS builder

WORKDIR /app

# Copiem pachetele pentru instalarea dependințelor
COPY package*.json ./

# Instalăm dependințele curate
RUN npm ci

# Copiem restul fișierelor proiectului (inclusiv tailwind.config.js, angular.json etc.)
COPY . .

# Compilăm aplicația în mod producție (va genera folderele browser și server)
RUN npm run build -- --configuration=production


# Stage 2: Serverul Node.js care va servi aplicația Angular SSR
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/dist/frontend/ ./dist/frontend/

# Expunem portul standard folosit de serverul de producție Angular Node SSR
EXPOSE 4000

# Comanda de pornire rulează serverul Node compilat de Angular pentru SSR
CMD ["node", "dist/frontend/server/server.mjs"]