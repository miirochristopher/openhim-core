FROM node:14.21.3-buster-slim as build

WORKDIR /build

COPY . .

RUN npm cache clean --force

RUN npm install && npm run build

FROM node:14.21.3-buster-slim

ENV NODE_ENV=production

RUN dpkg --configure -a

RUN apt update && apt install -f -y openssl

WORKDIR /app

COPY --from=build ./build/lib ./lib

COPY . .

RUN npm clean-install --production

CMD ["node", "lib/server.js"]