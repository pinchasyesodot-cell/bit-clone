import { jest } from "@jest/globals";

const mockListen = jest.fn();
const mockDbConnect = jest.fn<() => Promise<void>>();
const mockExit = jest.fn();

jest.unstable_mockModule("../src/server.js", () => ({ default: { listen: mockListen } }));
jest.unstable_mockModule("../src/config/db.js", () => ({
    default: { connect: mockDbConnect, disconnect: jest.fn(), isConnected: jest.fn() },
}));
jest.unstable_mockModule("../src/config/rabbitmq.js", () => ({
    rabbitMQConfig: { close: jest.fn(), consumeMessages: jest.fn(), publishMessage: jest.fn() },
}));
jest.unstable_mockModule("../src/service/socket.service.js", () => ({
    default: { initSocket: jest.fn(), close: jest.fn(), emitToUser: jest.fn() },
}));
jest.unstable_mockModule("../src/service/saga.service.js", () => ({
    SagaService: { consumeSagaMessages: jest.fn(), handleTimeouts: jest.fn() },
}));
jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("starting the saga service when the database is not available", () => {
    it("exits with 1 without listening", async () => {
        mockDbConnect.mockRejectedValue(new Error("no database"));
        jest.spyOn(process, "exit").mockImplementation(mockExit as never);
        const signalsBefore = process.listenerCount("SIGTERM");

        await import("../src/index.js");

        expect(mockExit).toHaveBeenCalledWith(1);
        expect(mockListen).not.toHaveBeenCalled();
        expect(process.listenerCount("SIGTERM")).toBe(signalsBefore);
    });
});
