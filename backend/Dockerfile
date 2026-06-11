# Stage 1: Build local
FROM node:20-alpine AS builder

WORKDIR /app

# Copiem doar fișierele de configurare pentru instalarea dependințelor
COPY package*.json tsconfig.json ./

# Instalăm toate dependințele (inclusiv devDependencies pentru TypeScript)
RUN npm ci

# Copiem codul sursă
COPY src/ ./src

# Compilăm TypeScript-ul în JavaScript (generează folderul /dist)
RUN npm run build

# Curățăm devDependencies pentru a păstra imaginea finală mică
RUN npm prune --production


# Stage 2: Runtime-ul de producție
FROM node:20-alpine AS runner

WORKDIR /app

# Setăm variabila de mediu pentru producție
ENV NODE_ENV=production

# Copiem doar modulele necesare de producție și codul compilat din etapa anterioară
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Expunem portul pe care rulează Express (configurat în .env sau default 3000)
EXPOSE 3000

# Volum persistent detectat automat de Hermes
VOLUME /data

# Pornim aplicația backend
CMD ["node", "dist/server.js"]