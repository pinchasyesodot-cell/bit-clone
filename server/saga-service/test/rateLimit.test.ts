import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import type { Saga } from "../src/interfaces/SagaType.js";

// Must be set before the server is imported, because the limiter reads it once.
process.env.TRANSFER_RATE_LIMIT = "2";

const mockCreate = jest.fn<(saga: Saga) => Promise<Saga>>();
const mockPublish = jest.fn<(queue: string, message: unknown) => Promise<void>>();

jest.unstable_mockModule("../src/config/rabbitmq.js", () => ({
    rabbitMQConfig: { publishMessage: mockPublish, consumeMessages: jest.fn() },
}));
jest.unstable_mockModule("../src/repository/saga.repository.js", () => ({
    SagaRepository: {
        create: mockCreate,
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

const transferFrom = (userId: number) =>
    request(server)
        .post("/api/saga")
        .set("Authorization", `Bearer ${jwt.sign({ userId }, process.env.JWT_SECRET!)}`)
        .send({ receiverId: "987654321", amount: 150 });

beforeEach(() => {
    mockCreate.mockImplementation((saga) => Promise.resolve(saga));
    mockPublish.mockResolvedValue(undefined);
});

describe("transfer rate limit", () => {
    it("allows up to the limit, then answers 429 without creating a saga", async () => {
        expect((await transferFrom(111111111)).status).toBe(201);
        expect((await transferFrom(111111111)).status).toBe(201);

        const blocked = await transferFrom(111111111);

        expect(blocked.status).toBe(429);
        expect(blocked.body).toEqual({ error: "Too many transfers, try again in a minute" });
        expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it("counts each user separately", async () => {
        expect((await transferFrom(222222222)).status).toBe(201);
    });
});
