FROM node:14.21.3-buster-slim as build

WORKDIR /build

COPY . .

RUN npm install && npm run build

FROM node:14.21.3-buster-slim

ENV NODE_ENV=production

RUN apt update && apt install -y openssl

WORKDIR /app

COPY --from=build ./build/lib ./lib

COPY . .

RUN npm clean-install --production

CMD ["node", "lib/server.js"]