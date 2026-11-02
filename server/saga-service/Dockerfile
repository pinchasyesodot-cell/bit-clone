FROM node:22-alpine AS build

WORKDIR /src/app

COPY package*.json .npmrc ./

RUN npm ci

COPY . .

RUN npm run build


FROM node:22-alpine AS production

WORKDIR /src/app

ENV NODE_ENV=production

COPY package*.json .npmrc ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /src/app/dist ./dist

RUN mkdir -p /src/app/logs && chown -R node:node logs

USER node

EXPOSE 4005

CMD ["node", "dist/index.js"]
