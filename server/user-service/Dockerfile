FROM node:26-alpine AS build

WORKDIR /src/app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build


FROM node:26-alpine AS production

WORKDIR /src/app

ENV NODE_ENV=production
ENV DOTENV_CONFIG_QUIET=true

COPY package*.json ./

RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /src/app/dist ./dist

USER node

EXPOSE 4000

CMD ["node", "--enable-source-maps", "dist/index.js"]
