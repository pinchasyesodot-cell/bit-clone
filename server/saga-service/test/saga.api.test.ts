import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env.js";
import { SagaStatus, type Saga } from "../src/interfaces/SagaType.js";
import { mongo } from "mongoose";

const mockPublish = jest.fn<(queue: string, message: unknown) => Promise<void>>();
const mockCreate = jest.fn<(saga: Saga) => Promise<Saga>>();
const mockFind = jest.fn<(senderId: string, idempotencyKey: string) => Promise<Saga | null>>();

jest.unstable_mockModule("../src/config/rabbitmq.js", () => ({
    rabbitMQConfig: { publishMessage: mockPublish, consumeMessages: jest.fn() },
}));
jest.unstable_mockModule("../src/repository/saga.repository.js", () => ({
    SagaRepository: {
        create: mockCreate,
        findByIdempotencyKey: mockFind,
        transition: jest.fn(),
        findTimedOutOpenSagas: jest.fn(),
        findUnconfirmedRefunds: jest.fn(),
        refreshUpdatedAt: jest.fn(),
    },
}));
jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { default: request } = await import("supertest");
const { default: server } = await import("../src/server.js");

const SENDER_ID = 123456789;
const KEY = "0193f2a4-6b1c-7d3e-a1b2-c3d4e5f60718";
const token = jwt.sign({ userId: SENDER_ID }, config.JWT_SECRET);

const postSaga = (body: unknown, authorization: string | null = `Bearer ${token}`, idempotencyKey?: string) => {
    let req = request(server).post("/api/saga");
    if (authorization !== null) req = req.set("Authorization", authorization);
    if (idempotencyKey) req = req.set("Idempotency-Key", idempotencyKey);
    return req.send(body as object);
};

describe("POST /api/saga", () => {
    beforeEach(() => {
        mockFind.mockResolvedValue(null);
        mockCreate.mockImplementation((saga) => Promise.resolve(saga));
        mockPublish.mockResolvedValue(undefined);
    });

    it("creates a PENDING saga for the user in the token and publishes a DEBIT_COMMAND", async () => {
        const res = await postSaga({ receiverId: "987654321", amount: 150 });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({
            senderId: String(SENDER_ID),
            receiverId: "987654321",
            amount: 150,
            status: "PENDING",
        });
        const saga = res.body as Saga;
        expect(typeof saga.sagaId).toBe("string");
        expect(mockPublish).toHaveBeenCalledTimes(1);
        expect(mockPublish).toHaveBeenCalledWith("debit_queue", { type: "DEBIT_COMMAND", payload: saga });
    });

    it("rejects a request without a token", async () => {
        const res = await postSaga({ receiverId: "987654321", amount: 150 }, null);
        expect(res.status).toBe(401);
        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockPublish).not.toHaveBeenCalled();
    });

    it("rejects an invalid token", async () => {
        const res = await postSaga({ receiverId: "987654321", amount: 150 }, "Bearer garbage");
        expect(res.status).toBe(401);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("rejects a client-supplied senderId, so nobody can move another user's money", async () => {
        const res = await postSaga({ senderId: "111111111", receiverId: "987654321", amount: 150 });
        expect(res.status).toBe(400);
        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockPublish).not.toHaveBeenCalled();
    });

    it.each([
        ["zero", 0],
        ["negative", -5],
        ["a string", "50"],
        ["a fraction of an agora", 10.5],
        ["above the maximum", 100_000_001],
    ])("rejects an amount that is %s", async (_label, amount) => {
        const res = await postSaga({ receiverId: "987654321", amount });
        expect(res.status).toBe(400);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("rejects a malformed receiverId", async () => {
        const res = await postSaga({ receiverId: "123", amount: 10 });
        expect(res.status).toBe(400);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("rejects sending money to yourself", async () => {
        const res = await postSaga({ receiverId: String(SENDER_ID), amount: 10 });
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ error: "Cannot send money to yourself" });
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("still accepts the transfer when RabbitMQ is down: the timeout check resolves it", async () => {
        mockPublish.mockRejectedValue(new Error("amqp://user:secret@rabbitmq is down"));

        const res = await postSaga({ receiverId: "987654321", amount: 10 });

        expect(res.status).toBe(201);
        expect(res.body).toMatchObject({ status: "PENDING" });
        expect(JSON.stringify(res.body)).not.toContain("secret");
    });

    it("answers with a generic 500 and no internal details when the database fails", async () => {
        mockCreate.mockRejectedValue(new Error("mongodb://user:secret@db is down"));

        const res = await postSaga({ receiverId: "987654321", amount: 10 });

        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "Internal Server Error" });
    });

    it("returns a JSON 404 for an unknown route", async () => {
        const res = await request(server).get("/api/saga/does-not-exist");
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "Route not found" });
    });

    describe("Idempotency-Key", () => {
        const existing = {
            sagaId: "x",
            senderId: String(SENDER_ID),
            receiverId: "987654321",
            amount: 150,
            status: SagaStatus.PENDING,
            idempotencyKey: KEY,
        };

        it("returns the saga created by a concurrent request with the same key", async () => {
            mockFind.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);
            mockCreate.mockRejectedValueOnce(
                new mongo.MongoServerError({ code: 11000, keyPattern: { senderId: 1, idempotencyKey: 1 } })
            );

            const res = await postSaga({ receiverId: "987654321", amount: 150 }, `Bearer ${token}`, KEY);

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ sagaId: "x" });
            expect(mockPublish).not.toHaveBeenCalled();
        });

        it("stores the key with a new saga on first use", async () => {
            const res = await postSaga({ receiverId: "987654321", amount: 150 }, `Bearer ${token}`, KEY);

            expect(res.status).toBe(201);
            expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: KEY }));
        });

        it("returns the saga already created for the same key instead of creating another", async () => {
            mockFind.mockResolvedValueOnce(existing);

            const res = await postSaga({ receiverId: "987654321", amount: 150 }, `Bearer ${token}`, KEY);

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({ sagaId: "x" });
            expect(mockCreate).not.toHaveBeenCalled();
            expect(mockPublish).not.toHaveBeenCalled();
        });

        it("answers 422 when the same key is reused for a different transfer", async () => {
            mockFind.mockResolvedValueOnce(existing);

            const res = await postSaga({ receiverId: "987654321", amount: 999 }, `Bearer ${token}`, KEY);

            expect(res.status).toBe(422);
            expect(mockCreate).not.toHaveBeenCalled();
        });

        it("rejects a key that is not a UUID", async () => {
            const res = await postSaga({ receiverId: "987654321", amount: 150 }, `Bearer ${token}`, "not-a-uuid");

            expect(res.status).toBe(400);
            expect(mockCreate).not.toHaveBeenCalled();
        });

        it("does not look anything up when no key is sent", async () => {
            const res = await postSaga({ receiverId: "987654321", amount: 150 });

            expect(res.status).toBe(201);
            expect(mockFind).not.toHaveBeenCalled();
        });
    });
});
