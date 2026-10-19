FROM node:20.19.5-alpine3.21

WORKDIR /app

RUN apk add --no-cache python3

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --offline

COPY . .
RUN npm test

EXPOSE 4173
CMD ["python3", "-m", "http.server", "4173", "--bind", "0.0.0.0"]
