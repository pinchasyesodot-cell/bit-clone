import { jest } from "@jest/globals";
import type { Server as HttpServer } from "node:http";

// What happened, in order: the startup, and then the shutdown.
const calls: string[] = [];

const mockListen = jest.fn<(port: number, onListening: () => void) => HttpServer>();
const mockDbConnect = jest.fn<() => Promise<void>>();
const mockDbDisconnect = jest.fn<() => Promise<void>>();
const mockRabbitClose = jest.fn<() => Promise<void>>();
const mockSocketInit = jest.fn<(server: HttpServer) => void>();
const mockSocketClose = jest.fn<() => Promise<void>>();
const mockConsume = jest.fn<() => Promise<void>>();
const mockHandleTimeouts = jest.fn<() => Promise<void>>();

const fakeHttpServer = {
    listening: true,
    close: (done: () => void) => {
        calls.push("http server closes");
        done();
    },
    closeIdleConnections: jest.fn(),
} as unknown as HttpServer;

jest.unstable_mockModule("../src/server.js", () => ({ default: { listen: mockListen } }));
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
    SagaService: { consumeSagaMessages: mockConsume, handleTimeouts: mockHandleTimeouts },
}));
jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const EVENTS = ["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"] as const;
const listenersOf = (event: (typeof EVENTS)[number]) => process.listeners(event as "SIGTERM");
const until = async (condition: () => boolean): Promise<void> => {
    for (let attempt = 0; attempt < 200; attempt++) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error("timed out");
};

describe("starting the saga service", () => {
    const before = EVENTS.map((event) => [event, listenersOf(event)] as const);
    // The jest config restores the spies before every test, so what the startup did is written down right after it.
    let startup: string[] = [];
    let listenArgs: unknown[] = [];
    let socketInitArgs: unknown[] = [];
    let interval: { callback: () => void; delay: number } = { callback: () => undefined, delay: 0 };

    beforeAll(async () => {
        mockDbConnect.mockImplementation(async () => void calls.push("database connects"));
        mockListen.mockImplementation((_port, onListening) => {
            calls.push("listens");
            onListening();
            return fakeHttpServer;
        });
        mockSocketInit.mockImplementation(() => void calls.push("websocket starts"));
        mockConsume.mockImplementation(async () => void calls.push("starts reading RabbitMQ"));
        const setIntervalSpy = jest.spyOn(globalThis, "setInterval");

        await import("../src/index.js");

        startup = [...calls];
        listenArgs = mockListen.mock.calls[0] ?? [];
        socketInitArgs = mockSocketInit.mock.calls[0] ?? [];
        const [callback, delay] = setIntervalSpy.mock.calls[0] ?? [];
        interval = { callback: callback as () => void, delay: delay as number };
    });

    afterAll(() => {
        for (const [event, existing] of before) {
            for (const listener of listenersOf(event)) {
                if (!existing.includes(listener)) process.removeListener(event as "SIGTERM", listener);
            }
        }
    });

    it("connects the database first, then listens, then starts the websocket and RabbitMQ", () => {
        expect(startup).toEqual(["database connects", "listens", "websocket starts", "starts reading RabbitMQ"]);
        expect(listenArgs[0]).toBe(4005);
        expect(socketInitArgs[0]).toBe(fakeHttpServer);
    });

    it("checks for timed-out sagas every 3 seconds", () => {
        expect(interval.delay).toBe(3000);
        interval.callback();
        expect(mockHandleTimeouts).toHaveBeenCalledTimes(1);
    });

    it("on SIGTERM: stops the checks, the websocket clients, the HTTP server, RabbitMQ and then the database", async () => {
        calls.length = 0;
        mockSocketClose.mockImplementation(async () => void calls.push("websocket clients closed"));
        mockRabbitClose.mockImplementation(async () => void calls.push("rabbitmq closes"));
        mockDbDisconnect.mockImplementation(async () => void calls.push("database disconnects"));
        jest.spyOn(process, "exit").mockImplementation(((code?: number) => {
            calls.push(`exit ${code}`);
        }) as never);
        const realClear = globalThis.clearInterval;
        jest.spyOn(globalThis, "clearInterval").mockImplementation(((timer: NodeJS.Timeout) => {
            calls.push("timeout check stops");
            realClear(timer);
        }) as never);

        process.emit("SIGTERM", "SIGTERM");
        await until(() => calls.includes("exit 0"));

        expect(calls).toEqual([
            "timeout check stops",
            "websocket clients closed",
            "http server closes",
            "rabbitmq closes",
            "database disconnects",
            "exit 0",
        ]);
    });
});
