FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci --force

COPY . .

RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

EXPOSE 4000

CMD ["node", "dist/frontend/server/server.mjs"]