# saga-service

The orchestrator of a money transfer. It moves money in two steps (debit the sender, then credit the receiver) by sending commands to the accounts service over RabbitMQ, and refunds the sender if anything fails or does not answer in time.

## How a transfer runs

| Event                                  | Saga status                  | Next action                              |
| -------------------------------------- | ---------------------------- | ---------------------------------------- |
| `POST /api/saga`                       | `PENDING`                    | publish `DEBIT_COMMAND`                  |
| debit succeeded                        | `PROCESSING`                 | publish `CREDIT_COMMAND`                 |
| debit failed                           | `FAILED`                     | none                                     |
| credit succeeded                       | `COMPLETED`                  | none                                     |
| credit failed                          | `COMPENSATING`               | publish `REFUND_COMMAND`                 |
| refund succeeded                       | `FAILED`                     | none (the money is back with the sender) |
| refund refused with `ALREADY_CREDITED` | `COMPLETED`                  | none (the credit went through after all) |
| no progress for 10 seconds             | decided by the timeout check | see below                                |

Every status change is a compare-and-set in MongoDB, so a duplicate or late reply is ignored.

### The timeout check

Every 3 seconds the saga looks for transfers that did not move for 10 seconds.

- `PENDING` or `PROCESSING`: it asks the accounts service what happened (`GET /:sagaId`). If the receiver was credited the saga becomes `COMPLETED`, if the sender was already refunded it becomes `FAILED`, otherwise it becomes `COMPENSATING` and a `REFUND_COMMAND` is sent. If the accounts service cannot be reached nothing changes and the check tries again, a refund is never sent blindly.
- `COMPENSATING`: a refund that got no answer for 10 seconds is sent again, until it is answered.

A reply that cannot be processed is retried once and then dropped. The timeout check repairs the saga from the real state in the accounts service.

## Messaging contract (what the accounts service must implement)

Queues are durable and messages are persistent. Every publish waits for the broker's confirmation.

Commands, sent to `debit_queue`, `credit_queue` and `refund_queue`:

```json
{
    "type": "DEBIT_COMMAND",
    "payload": {
        "sagaId": "...",
        "senderId": "111111111",
        "receiverId": "222222222",
        "amount": 50,
        "status": "PENDING"
    }
}
```

`type` is `DEBIT_COMMAND`, `CREDIT_COMMAND` or `REFUND_COMMAND`.

Replies, sent to `saga_response_queue`:

```json
{ "type": "DEBIT_RESPONSE", "payload": { "sagaId": "...", "success": true } }
```

`type` is `DEBIT_RESPONSE`, `CREDIT_RESPONSE` or `REFUND_RESPONSE`. On failure `success` is `false` and `error` may carry a reason.

State check: `GET {URL_ACCOUNTS}/{sagaId}` always answers `200` with `{ "debited": boolean, "credited": boolean, "refunded": boolean }` (all `false` when nothing happened for that saga, never `404`).

Rules for the accounts service, all per `sagaId`:

- Commands can arrive more than once and in any order. Process each saga once and answer a repeated command the way it was answered the first time.
- Save the state before replying, and acknowledge the command only after that.
- `DEBIT`: refuse if the saga was cancelled (a refund was recorded) or the funds are not enough.
- `CREDIT`: only after a debit and never after a refund. A frozen account refuses (this is how the refund flow is tested).
- `REFUND`: after a debit and before a credit it returns the money. For a saga that was never debited it records a cancellation and answers `success: true`, so a debit that arrives later is refused. A repeated refund answers `success: true` again. If the receiver was already credited it answers `success: false` with `error: "ALREADY_CREDITED"`.

## API

| Method | Path        | Auth         | Body                                    | Success                                   |
| ------ | ----------- | ------------ | --------------------------------------- | ----------------------------------------- |
| POST   | `/api/saga` | Bearer token | `{ receiverId (9 characters), amount }` | `201` with the saga                       |
| GET    | `/health`   | none         | none                                    | `200`, or `503` when the database is down |

`amount` is a number greater than 0, up to 1,000,000 and with at most two decimals. The sender is always the user in the token. A body with `senderId` or any other unknown field is rejected, and so is a transfer to yourself. Errors are JSON: `{ "error": "..." }`.

If the debit command cannot be confirmed by the broker the request still answers `201`: the saga is stored and the timeout check resolves it.

### Live updates (Socket.IO)

Connect with `io(url, { auth: { token } })`. Each user receives events about their own transfers (as the sender): `saga:processing`, `saga:completed`, `saga:failed` and `saga:compensating`, each with the saga as the payload.

## Configuration

| Variable       | Meaning                                                              |
| -------------- | -------------------------------------------------------------------- |
| `PORT`         | port the service listens on                                          |
| `NODE_ENV`     | `development`, `production` or `test`                                |
| `MONGO_URI`    | MongoDB connection string                                            |
| `RABBITMQ_URI` | RabbitMQ connection string                                           |
| `URL_ACCOUNTS` | base URL of the accounts service                                     |
| `JWT_SECRET`   | signing secret, the same value in every service that verifies tokens |
| `URL_CLIENT`   | allowed origin of the web client (required)                          |

If the connection to RabbitMQ is lost the service exits, so the container's restart policy starts it again.

## Run

Locally (needs MongoDB and RabbitMQ):

```
cp .env.example .env      # then edit the values
npm ci
npm run dev
```

Tests (no database or broker needed, except `saga.repository.test.ts`, which downloads a MongoDB binary on its first run):

```
npm run test:ci
```

Docker, from the `server` folder:

```
cp saga-service/.env.example saga-service/.env
cp saga-service/.env.docker.example saga-service/.env.docker
docker compose up --build
```

The RabbitMQ management UI is at `http://localhost:15672` (localhost only) with the credentials from `.env.docker`. Until the accounts service exists a transfer stays `PENDING`, because the saga cannot ask it what happened.

## Checks

`npm run lint`, `npm run typecheck`, `npm run test:ci`, `npm run build` (the same steps CI runs).
