# user-service

Registers users, logs them in and issues the JWT that the other services trust.

## API

| Method | Path                 | Auth         | Body                                                          | Success                                                                                             |
| ------ | -------------------- | ------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| POST   | `/api/users`         | none         | `{ userId (9 digits), userName, password (6-72 characters) }` | `201` with the user                                                                                 |
| POST   | `/api/users/login`   | none         | `{ userId, password }`                                        | `200` with `{ userId, userName }` and the header `Authorization: Bearer <token>` (valid for 1 hour) |
| GET    | `/api/users/profile` | Bearer token | none                                                          | `200` with the user                                                                                 |
| GET    | `/health`            | none         | none                                                          | `200`, or `503` when the database is down                                                           |

Errors are always JSON: `{ "error": "..." }`.

## Events

After a user is saved, user-service publishes to `user_created_queue` (persistent, confirmed by the broker):

```json
{ "type": "USER_CREATED", "payload": { "userId": "123456789" } }
```

account-service opens the user's 0 ₪ account when it gets it. If the broker does not confirm the event, the user is removed again and the signup answers `500`, so it can simply be retried.

Known gap: if user-service stops between saving the user and publishing, the user stays without an account. Closing it needs a transactional outbox (save the event with the user in one transaction, and publish it from there).

## Configuration

| Variable       | Meaning                                                                            |
| -------------- | ---------------------------------------------------------------------------------- |
| `PORT`         | port the service listens on                                                        |
| `NODE_ENV`     | `development`, `production` or `test`                                              |
| `MONGO_URI`    | MongoDB connection string                                                          |
| `JWT_SECRET`   | signing secret, must be the same in every service that verifies tokens             |
| `URL_CLIENT`   | allowed browser origin (browsers are blocked when it is missing)                   |
| `RABBITMQ_URI` | RabbitMQ connection string, with the user and password from `server/rabbitmq/.env` |

## Run

Locally (needs MongoDB at `MONGO_URI` and RabbitMQ at `RABBITMQ_URI`):

```
cp .env.example .env      # then edit the values
npm ci
npm run dev
```

Tests (no database or broker needed: MongoDB runs in memory, RabbitMQ is faked):

```
npm run test:ci
```

Docker, from the `server` folder:

```
cp user-service/.env.example user-service/.env
cp user-service/.env.docker.example user-service/.env.docker
cp rabbitmq/.env.example rabbitmq/.env
docker compose up --build
```

The API is then available through nginx at `http://localhost/api/users`. MongoDB is published on `127.0.0.1:27018` only.

## Checks

`npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build` (the same steps CI runs).
