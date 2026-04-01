# frontend/Dockerfile
# Builds the React app and serves it via nginx

FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci --silent

# Copy source and build
COPY . .
# Build args injected at build time (set in docker-compose or CI)
ARG VITE_API_URL
ARG VITE_BING_MAPS_KEY
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BING_MAPS_KEY=$VITE_BING_MAPS_KEY
RUN npm run build

# ── Runtime: serve with nginx ────────────────────────────────
FROM nginx:alpine

# Copy the built React app
COPY --from=builder /app/dist /usr/share/nginx/html

# nginx config: serve SPA (all routes → index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
