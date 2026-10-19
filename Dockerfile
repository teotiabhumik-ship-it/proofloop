FROM node:20.19.5-alpine3.21

WORKDIR /app
ENV PROOFLOOP_DATA_DIR=/app/.data

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --offline

COPY . .
RUN npm test

EXPOSE 4173
VOLUME ["/app/.data"]
CMD ["node", "server.js"]
