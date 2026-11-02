import { jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import type { ExtendedError, Socket } from "socket.io";
import { config } from "../src/config/env.js";

jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { socketAuth } = await import("../src/middlewares/socketAuth.js");

type FakeSocket = { handshake: { auth: { token?: string } }; data: { userId?: string } };

const runAuth = (token?: string) => {
    const socket: FakeSocket = { handshake: { auth: token === undefined ? {} : { token } }, data: {} };
    const next = jest.fn<(err?: ExtendedError) => void>();
    socketAuth(socket as unknown as Socket, next);
    return { socket, next };
};

const sign = (payload: object, secret: string = config.JWT_SECRET, options: jwt.SignOptions = {}): string =>
    jwt.sign(payload, secret, options);

describe("socketAuth", () => {
    it("accepts a valid token and stores the userId as a string on the socket", () => {
        const { socket, next } = runAuth(sign({ userId: 123456789 }));

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith();
        expect(socket.data.userId).toBe("123456789");
    });

    it.each([
        ["no token", undefined],
        ["garbage instead of a token", "not-a-real-token"],
        ["a token signed with another secret", sign({ userId: 123456789 }, "another-secret")],
        ["an expired token", sign({ userId: 123456789 }, config.JWT_SECRET, { expiresIn: -10 })],
        ["a valid token without a userId", sign({})],
        ["a valid token whose userId is not a number", sign({ userId: "abc" })],
        ["a valid token whose userId is not an integer", sign({ userId: 1.5 })],
    ])("rejects %s", (_label, token) => {
        const { socket, next } = runAuth(token);

        expect(next).toHaveBeenCalledTimes(1);
        const error = next.mock.calls[0]?.[0];
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toBe("Unauthorized");
        expect(socket.data.userId).toBeUndefined();
    });
});
