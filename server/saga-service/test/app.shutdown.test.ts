import { jest } from "@jest/globals";
import type { Server as HttpServer } from "node:http";

const calls: string[] = [];

const mockDbConnect = jest.fn<() => Promise<void>>();
const mockDbDisconnect = jest.fn<() => Promise<void>>();
const mockSocketInit = jest.fn<(server: HttpServer) => void>();
const mockSocketClose = jest.fn<() => Promise<void>>();
const mockRabbitClose = jest.fn<() => Promise<void>>();
const mockConsumeSagaMessages = jest.fn<() => Promise<void>>();
const mockHandleTimeouts = jest.fn<() => Promise<void>>();

jest.unstable_mockModule("../src/config/db.js", () => ({
    default: { connect: mockDbConnect, disconnect: mockDbDisconnect, isConnected: jest.fn() },
}));
jest.unstable_mockModule("../src/config/rabbitmq.js", () => ({
    rabbitMQConfig: { close: mockRabbitClose, consumeMessages: jest.fn(), publishMessage: jest.fn() },
}));
jest.unstable_mockModule("../src/service/socket.service.js", () => ({
    default: { initSocket: mockSocketInit, close: mockSocketClose, emitToUser: jest.fn() },
}));
jest.unstable_mockModule("../src/service/saga.service.js", () => ({
    SagaService: { consumeSagaMessages: mockConsumeSagaMessages, handleTimeouts: mockHandleTimeouts },
}));
jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { default: server } = await import("../src/app.js");

const EVENTS = ["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"] as const;
const listenersOf = (event: (typeof EVENTS)[number]) => process.listeners(event as "SIGTERM");

const until = async (condition: () => boolean): Promise<void> => {
    for (let attempt = 0; attempt < 100; attempt++) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("timed out waiting for the shutdown to finish");
};

describe("graceful shutdown", () => {
    const before = EVENTS.map((event) => [event, listenersOf(event)] as const);

    afterEach(() => {
        for (const [event, existing] of before) {
            for (const listener of listenersOf(event)) {
                if (!existing.includes(listener)) process.removeListener(event as "SIGTERM", listener);
            }
        }
    });

    it("stops the timer, closes the sockets, then RabbitMQ, then the database, and exits with 0", async () => {
        mockDbConnect.mockResolvedValue(undefined);
        mockConsumeSagaMessages.mockResolvedValue(undefined);
        mockSocketClose.mockImplementation(async () => void calls.push("sockets"));
        mockRabbitClose.mockImplementation(async () => void calls.push("rabbitmq"));
        mockDbDisconnect.mockImplementation(async () => void calls.push("database"));
        const fakeHttpServer = { listening: false, close: jest.fn() } as unknown as HttpServer;
        jest.spyOn(server.app, "listen").mockImplementation((() => fakeHttpServer) as never);
        jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
            calls.push(`exit ${code}`);
        }) as never);
        const clear = jest.spyOn(globalThis, "clearInterval");
        const setTimer = jest.spyOn(globalThis, "setTimeout");
        const clearTimer = jest.spyOn(globalThis, "clearTimeout");

        await server.start();
        process.emit("SIGTERM", "SIGTERM");
        await until(() => calls.includes("exit 0"));

        expect(calls).toEqual(["sockets", "rabbitmq", "database", "exit 0"]);
        expect(clear).toHaveBeenCalled();
        const forceExitIndex = setTimer.mock.calls.findIndex(([, delay]) => delay === 10000);
        expect(forceExitIndex).toBeGreaterThanOrEqual(0);
        expect(clearTimer).toHaveBeenCalledWith(setTimer.mock.results[forceExitIndex]?.value);
    });
});
