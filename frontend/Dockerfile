# Stage 1: Build Angular ca SPA static (fără SSR)
FROM node:22-alpine AS builder

WORKDIR /app

# Copiem pachetele pentru instalarea dependințelor
COPY package*.json ./

# Instalăm dependințele curate
RUN npm ci

# Copiem restul fișierelor proiectului (tailwind, angular.json etc.)
COPY . .

# Build de producție. Fără SSR, @angular/build emite doar dist/frontend/browser.
RUN npm run build -- --configuration=production


# Stage 2: Servire statică prin nginx (fără server Node => fără validare de Host SSR)
FROM nginx:alpine AS runtime

COPY --from=builder /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

# Păstrăm portul 4000 ca să nu fie nevoie să schimbi nimic în Hermes.
EXPOSE 4000
