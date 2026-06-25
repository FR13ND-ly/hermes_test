# Stage 1: Local build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy only configuration files for dependency installation
COPY package*.json tsconfig.json ./

# Install all dependencies (including devDependencies for TypeScript)
RUN npm ci

# Copy source code
COPY src/ ./src

# Compile TypeScript to JavaScript (generates the /dist folder)
RUN npm run build

# Remove devDependencies to keep the final image small
RUN npm prune --production


# Stage 2: Production runtime
FROM node:20-alpine AS runner

WORKDIR /app

# Set production environment variable
ENV NODE_ENV=production

# Copy only the production modules and compiled code from the previous stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Expose the port Express listens on (configured in .env or defaults to 3000)
EXPOSE 3000

# Persistent volume auto-detected by Hermes
VOLUME /data

# Start the backend application
CMD ["node", "dist/server.js"]
