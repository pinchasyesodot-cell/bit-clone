# user-service

Registers users, logs them in and issues the JWT that the other services trust.

## API

| Method | Path                 | Auth         | Body                                                          | Success                                                                                             |
| ------ | -------------------- | ------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| POST   | `/api/users`         | none         | `{ userId (9 digits), userName, password (6-72 characters) }` | `201` with the user                                                                                 |
| POST   | `/api/users/login`   | none         | `{ userName, password }`                                      | `200` with `{ userId, userName }` and the header `Authorization: Bearer <token>` (valid for 1 hour) |
| GET    | `/api/users/profile` | Bearer token | none                                                          | `200` with the user                                                                                 |
| GET    | `/health`            | none         | none                                                          | `200`, or `503` when the database is down                                                           |

Errors are always JSON: `{ "error": "..." }`.

## Configuration

| Variable     | Meaning                                                                |
| ------------ | ---------------------------------------------------------------------- |
| `PORT`       | port the service listens on                                            |
| `NODE_ENV`   | `development`, `production` or `test`                                  |
| `MONGO_URI`  | MongoDB connection string                                              |
| `JWT_SECRET` | signing secret, must be the same in every service that verifies tokens |
| `URL_CLIENT` | allowed browser origin (browsers are blocked when it is missing)       |

## Run

Locally (needs MongoDB at `MONGO_URI`):

```
cp .env.example .env      # then edit the values
npm ci
npm run dev
```

Tests (need MongoDB):

```
cp .env.test.example .env.test
npm run test:ci
```

The user suite deletes users by id, so it refuses to run unless the database name ends with `-test`.

Docker, from the `server` folder:

```
cp user-service/.env.example user-service/.env
cp user-service/.env.docker.example user-service/.env.docker
docker compose up --build
```

The API is then available through nginx at `http://localhost/api/users`. MongoDB is published on `127.0.0.1:27017` only.

## Checks

`npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build` (the same steps CI runs).
