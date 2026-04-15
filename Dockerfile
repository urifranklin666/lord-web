FROM node:20-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package.json ./
RUN npm install --omit=dev

# Copy source
COPY server.js ./
COPY game/    ./game/
COPY public/  ./public/
COPY art/     ./art/

# Data directory is a volume mount at runtime
# (contains LENEMY.DAT, LORDTXT.DAT, players.json, etc.)
VOLUME ["/app/data"]

ENV PORT=7682
EXPOSE 7682

HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:7682/health || exit 1

CMD ["node", "server.js"]
