import { jest } from "@jest/globals";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import jwt from "jsonwebtoken";
import { io as connectClient, type Socket as ClientSocket } from "socket.io-client";
import { config } from "../src/config/env.js";

jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { default: socketService } = await import("../src/service/socket.service.js");

let httpServer: Server;
let port: number;
const openClients: ClientSocket[] = [];

const tokenFor = (userId: number): string => jwt.sign({ userId }, config.JWT_SECRET);

const connect = (token?: string): Promise<ClientSocket> =>
    new Promise((resolve, reject) => {
        const client = connectClient(`http://localhost:${port}`, {
            auth: token === undefined ? {} : { token },
            transports: ["websocket"],
            reconnection: false,
        });
        openClients.push(client);
        client.on("connect", () => resolve(client));
        client.on("connect_error", (error) => reject(error));
    });

const nextEvent = <T>(client: ClientSocket, event: string): Promise<T> =>
    new Promise((resolve) => {
        client.once(event, (data: T) => resolve(data));
    });

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

beforeAll(async () => {
    httpServer = createServer();
    socketService.initSocket(httpServer);
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
});

afterEach(() => {
    while (openClients.length > 0) openClients.pop()?.close();
});

afterAll(async () => {
    httpServer.closeAllConnections();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

describe("SocketService", () => {
    it("refuses a connection without a token", async () => {
        await expect(connect()).rejects.toThrow("Unauthorized");
    });

    it("refuses a connection with a bad token", async () => {
        await expect(connect("garbage")).rejects.toThrow("Unauthorized");
    });

    it("delivers an event to the connected user", async () => {
        const client = await connect(tokenFor(111111111));
        const received = nextEvent<{ sagaId: string }>(client, "saga:completed");

        socketService.emitToUser("111111111", "saga:completed", { sagaId: "saga-1" });

        await expect(received).resolves.toEqual({ sagaId: "saga-1" });
    });

    it("does not deliver an event to a different user", async () => {
        const owner = await connect(tokenFor(111111111));
        const stranger = await connect(tokenFor(222222222));
        const ownerReceived = nextEvent(owner, "saga:failed");
        const strangerListener = jest.fn();
        stranger.on("saga:failed", strangerListener);

        socketService.emitToUser("111111111", "saga:failed", { sagaId: "saga-1" });

        await ownerReceived;
        await pause(100);
        expect(strangerListener).not.toHaveBeenCalled();
    });

    it("delivers an event to every open tab of the same user", async () => {
        const tabOne = await connect(tokenFor(111111111));
        const tabTwo = await connect(tokenFor(111111111));
        const first = nextEvent(tabOne, "saga:processing");
        const second = nextEvent(tabTwo, "saga:processing");

        socketService.emitToUser("111111111", "saga:processing", { sagaId: "saga-1" });

        await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    });
});
