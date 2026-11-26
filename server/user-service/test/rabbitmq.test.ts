import { jest } from "@jest/globals";
import type { UserCreatedEvent } from "../src/interfaces/userType.js";

type Listener = (...args: unknown[]) => void;
type ConfirmCallback = (error: unknown) => void;

const events: string[] = [];

const makeEmitter = () => {
    const on = jest.fn<(event: string, listener: Listener) => void>();
    const fire = (event: string): void => {
        for (const [name, listener] of on.mock.calls) if (name === event) listener();
    };
    return { on, fire };
};
const connectionEvents = makeEmitter();
const publishEvents = makeEmitter();

const mockAssertQueue = jest.fn<(queue: string, options: unknown) => Promise<void>>();
const mockSendToQueue = jest.fn<(queue: string, content: Buffer, options: unknown, done: ConfirmCallback) => boolean>();
const mockClosePublishChannel = jest.fn<() => Promise<void>>();
const mockCloseConnection = jest.fn<() => Promise<void>>();

const publishChannel = {
    on: publishEvents.on,
    assertQueue: mockAssertQueue,
    sendToQueue: mockSendToQueue,
    close: mockClosePublishChannel,
};
const mockCreateConfirmChannel = jest.fn<() => Promise<typeof publishChannel>>();
const fakeConnection = {
    on: connectionEvents.on,
    createConfirmChannel: mockCreateConfirmChannel,
    close: mockCloseConnection,
};
const mockConnect = jest.fn<(url: string) => Promise<typeof fakeConnection>>();

jest.unstable_mockModule("amqplib", () => ({ default: { connect: mockConnect } }));
jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { rabbitMQConfig } = await import("../src/config/rabbitmq.js");

const event: UserCreatedEvent = { type: "USER_CREATED", payload: { userId: "123456789" } };

// Records the step and resolves, like the real async function would.
const record = (step: string) => () => {
    events.push(step);
    return Promise.resolve();
};

beforeEach(async () => {
    mockConnect.mockResolvedValue(fakeConnection);
    mockCreateConfirmChannel.mockResolvedValue(publishChannel);
    mockAssertQueue.mockResolvedValue(undefined);
    mockSendToQueue.mockImplementation((_queue, _content, _options, done) => {
        done(null);
        return true;
    });
    mockClosePublishChannel.mockImplementation(record("close publish channel"));
    mockCloseConnection.mockImplementation(record("close connection"));
    rabbitMQConfig.publishTimeoutMs = 5000;
    await rabbitMQConfig.close();
    events.length = 0;
    jest.clearAllMocks();
});

describe("publishMessage", () => {
    it("sends the event as persistent JSON to a durable queue and resolves once the broker confirms", async () => {
        await rabbitMQConfig.publishMessage("user_created_queue", event);

        expect(mockAssertQueue).toHaveBeenCalledWith("user_created_queue", { durable: true });
        const [queue, content, options] = mockSendToQueue.mock.calls[0] ?? [];
        expect(queue).toBe("user_created_queue");
        expect(JSON.parse(String(content))).toEqual(event);
        expect(options).toEqual({ persistent: true });
    });

    it("rejects when the broker refuses the message", async () => {
        mockSendToQueue.mockImplementationOnce((_queue, _content, _options, done) => {
            done(new Error("message refused"));
            return true;
        });

        await expect(rabbitMQConfig.publishMessage("user_created_queue", event)).rejects.toThrow("message refused");
    });

    it("rejects when the broker does not answer in time", async () => {
        mockSendToQueue.mockImplementationOnce(() => true);
        rabbitMQConfig.publishTimeoutMs = 20;

        await expect(rabbitMQConfig.publishMessage("user_created_queue", event)).rejects.toThrow(/did not confirm/);
    });

    it("declares each queue only once", async () => {
        await rabbitMQConfig.publishMessage("user_created_queue", event);
        await rabbitMQConfig.publishMessage("user_created_queue", event);
        expect(mockAssertQueue).toHaveBeenCalledTimes(1);
    });

    it("uses one connection and one channel even when several publishes start together", async () => {
        await Promise.all([
            rabbitMQConfig.publishMessage("user_created_queue", event),
            rabbitMQConfig.publishMessage("user_created_queue", event),
            rabbitMQConfig.publishMessage("user_created_queue", event),
        ]);

        expect(mockConnect).toHaveBeenCalledTimes(1);
        expect(mockCreateConfirmChannel).toHaveBeenCalledTimes(1);
    });

    it("opens a new channel (and declares the queue again) after the broker closed the old one", async () => {
        await rabbitMQConfig.publishMessage("user_created_queue", event);
        publishEvents.fire("close");
        await rabbitMQConfig.publishMessage("user_created_queue", event);

        expect(mockCreateConfirmChannel).toHaveBeenCalledTimes(2);
        expect(mockAssertQueue).toHaveBeenCalledTimes(2);
    });

    it("tries to connect again after a failed attempt", async () => {
        mockConnect.mockRejectedValueOnce(new Error("connection refused"));

        await expect(rabbitMQConfig.publishMessage("user_created_queue", event)).rejects.toThrow("connection refused");
        await expect(rabbitMQConfig.publishMessage("user_created_queue", event)).resolves.toBeUndefined();
    });
});

describe("close", () => {
    it("closes the channel and then the connection", async () => {
        await rabbitMQConfig.publishMessage("user_created_queue", event);

        await rabbitMQConfig.close();

        expect(events).toEqual(["close publish channel", "close connection"]);
    });

    it("can be used again afterwards", async () => {
        await rabbitMQConfig.publishMessage("user_created_queue", event);
        await rabbitMQConfig.close();
        await rabbitMQConfig.publishMessage("user_created_queue", event);

        expect(mockConnect).toHaveBeenCalledTimes(2);
    });
});

describe("losing the broker", () => {
    // Unlike saga-service, this jest config has no restoreMocks, so the process.exit spy is undone here.
    afterEach(() => {
        jest.restoreAllMocks();
    });

    it("exits so the service is restarted when the connection is lost", async () => {
        const exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        await rabbitMQConfig.publishMessage("user_created_queue", event);

        connectionEvents.fire("close");

        expect(exit).toHaveBeenCalledWith(1);
    });

    it("keeps running when only the publish channel is closed (the next publish opens a new one)", async () => {
        const exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        await rabbitMQConfig.publishMessage("user_created_queue", event);

        publishEvents.fire("close");

        expect(exit).not.toHaveBeenCalled();
    });

    it("does not exit because of its own close()", async () => {
        const exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        mockCloseConnection.mockImplementation(() => {
            connectionEvents.fire("close");
            return Promise.resolve();
        });
        await rabbitMQConfig.publishMessage("user_created_queue", event);

        await rabbitMQConfig.close();

        expect(exit).not.toHaveBeenCalled();
    });
});
