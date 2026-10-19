FROM node:20.19.5-alpine3.21

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --offline

COPY . .
RUN npm test

EXPOSE 4173
CMD ["node", "server.js"]
