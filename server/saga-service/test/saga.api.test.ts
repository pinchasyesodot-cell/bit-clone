import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env.js";
import type { Saga } from "../src/interfaces/SagaType.js";

const mockPublish = jest.fn<(queue: string, message: unknown) => Promise<boolean>>();
const mockCreate = jest.fn<(saga: Saga) => Promise<Saga>>();

jest.unstable_mockModule("../src/config/rabbitmq.js", () => ({
    rabbitMQConfig: { publishMessage: mockPublish, consumeMessages: jest.fn() },
}));
jest.unstable_mockModule("../src/repository/saga.repository.js", () => ({
    SagaRepository: { create: mockCreate, transition: jest.fn(), findTimedOut: jest.fn() },
}));
jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { default: request } = await import("supertest");
const { default: server } = await import("../src/app.js");

const SENDER_ID = 123456789;
const token = jwt.sign({ userId: SENDER_ID }, config.JWT_SECRET);

const postSaga = (body: unknown, authorization: string | null = `Bearer ${token}`) => {
    const req = request(server.app).post("/api/saga");
    return (authorization === null ? req : req.set("Authorization", authorization)).send(body as object);
};

describe("POST /api/saga", () => {
    beforeEach(() => {
        mockCreate.mockImplementation(async (saga) => saga);
        mockPublish.mockResolvedValue(true);
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
        expect(typeof res.body.sagaId).toBe("string");
        expect(mockPublish).toHaveBeenCalledTimes(1);
        expect(mockPublish).toHaveBeenCalledWith("debit_queue", { type: "DEBIT_COMMAND", payload: res.body });
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
        ["three decimal places", 10.256],
        ["above the maximum", 2_000_000],
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

    it("answers with a generic 500 and no internal details when RabbitMQ fails", async () => {
        mockPublish.mockRejectedValue(new Error("amqp://user:secret@rabbitmq is down"));
        const res = await postSaga({ receiverId: "987654321", amount: 10 });
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: "Internal Server Error" });
    });

    it("returns a JSON 404 for an unknown route", async () => {
        const res = await request(server.app).get("/api/saga/does-not-exist");
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: "Route not found" });
    });
});
