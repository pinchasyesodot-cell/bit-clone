import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { config } from "../src/config/env.js";

jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { default: request } = await import("supertest");
const { default: server } = await import("../src/server.js");

const token = jwt.sign({ userId: 123456789 }, config.JWT_SECRET);

const postSaga = (body: unknown) =>
    request(server)
        .post("/api/saga")
        .set("Authorization", `Bearer ${token}`)
        .send(body as object);

describe("POST /api/saga: validation messages reach the client", () => {
    it.each([
        ["a receiverId that is too short", { receiverId: "123", amount: 10 }, /exactly 9 characters/],
        ["a missing receiverId", { amount: 10 }, /Receiver ID is a required field/],
        ["an amount of zero", { receiverId: "987654321", amount: 0 }, /greater than 0/],
        ["an amount sent as a string", { receiverId: "987654321", amount: "10" }, /valid number/],
        ["a missing amount", { receiverId: "987654321" }, /Amount is a required field/],
        ["a client-supplied senderId", { senderId: "111111111", receiverId: "987654321", amount: 10 }, /senderId/],
    ])("answers 400 with the reason for %s", async (_label, body, reason) => {
        const res = await postSaga(body);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(reason);
    });
});
