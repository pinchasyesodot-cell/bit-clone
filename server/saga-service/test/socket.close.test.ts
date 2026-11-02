import { jest } from "@jest/globals";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { io as connectClient } from "socket.io-client";
import { config } from "../src/config/env.js";

jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { default: socketService } = await import("../src/service/socket.service.js");

describe("SocketService.close", () => {
    it("disconnects connected clients and closes the HTTP server instead of waiting for them", async () => {
        const httpServer = createServer();
        socketService.initSocket(httpServer);
        await new Promise<void>((resolve) => httpServer.listen(0, resolve));
        const port = (httpServer.address() as AddressInfo).port;
        const client = connectClient(`http://localhost:${port}`, {
            auth: { token: jwt.sign({ userId: 111111111 }, config.JWT_SECRET) },
            transports: ["websocket"],
            reconnection: false,
        });
        await new Promise<void>((resolve, reject) => {
            client.on("connect", () => resolve());
            client.on("connect_error", reject);
        });
        const disconnected = new Promise<void>((resolve) => client.on("disconnect", () => resolve()));

        await socketService.close();

        await disconnected;
        expect(client.connected).toBe(false);
        expect(httpServer.listening).toBe(false);
    });

    it("can be called again, and sending after it is a no-op", async () => {
        await expect(socketService.close()).resolves.toBeUndefined();
        expect(() => socketService.emitToUser("111111111", "saga:completed", {})).not.toThrow();
    });
});
