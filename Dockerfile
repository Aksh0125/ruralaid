FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

RUN npm install -g typescript ts-node
RUN npm run build

EXPOSE 3000

CMD ["node", "dist/app.js"]
