FROM node:20-alpine AS build

WORKDIR /src/app

COPY package*.json ./

COPY .npmrc ./

RUN npm install

COPY . .

RUN npm run build


FROM node:20-alpine AS production

WORKDIR /src/app

COPY package*.json ./

COPY .npmrc ./

COPY --from=build /src/app/dist ./dist

RUN npm install --production

EXPOSE 3000

CMD ["node", "app.js"]
