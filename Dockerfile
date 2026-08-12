# --- Build stage ---
FROM node:20-slim AS build
WORKDIR /app

# sharp needs build tools for its native binary on some platforms
RUN apt-get update -qq && apt-get install -y -qq python3 build-essential && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# --- Runtime stage ---
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main"]
