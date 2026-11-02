import { jest } from "@jest/globals";
import { SagaStatus, type SagaCommand, type SagaResponse } from "../src/interfaces/SagaType.js";

type FakeMessage = { content: Buffer; fields: { redelivered: boolean } };
type Consumer = (msg: FakeMessage | null) => Promise<void>;
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
const consumeEvents = makeEmitter();

const mockAssertQueue = jest.fn<(queue: string, options: unknown) => Promise<void>>();
const mockSendToQueue = jest.fn<(queue: string, content: Buffer, options: unknown, done: ConfirmCallback) => boolean>();
const mockPrefetch = jest.fn<(count: number) => Promise<void>>();
const mockChannelConsume = jest.fn<(queue: string, consumer: Consumer) => Promise<{ consumerTag: string }>>();
const mockCancel = jest.fn<(tag: string) => Promise<void>>();
const mockAck = jest.fn<(msg: FakeMessage) => void>();
const mockNack = jest.fn<(msg: FakeMessage, allUpTo: boolean, requeue: boolean) => void>();
const mockClosePublishChannel = jest.fn<() => Promise<void>>();
const mockCloseConsumeChannel = jest.fn<() => Promise<void>>();
const mockCloseConnection = jest.fn<() => Promise<void>>();

const publishChannel = {
    on: publishEvents.on,
    assertQueue: mockAssertQueue,
    sendToQueue: mockSendToQueue,
    close: mockClosePublishChannel,
};
const consumeChannel = {
    on: consumeEvents.on,
    assertQueue: mockAssertQueue,
    prefetch: mockPrefetch,
    consume: mockChannelConsume,
    cancel: mockCancel,
    ack: mockAck,
    nack: mockNack,
    close: mockCloseConsumeChannel,
};
const mockCreateConfirmChannel = jest.fn<() => Promise<typeof publishChannel>>();
const mockCreateChannel = jest.fn<() => Promise<typeof consumeChannel>>();
const fakeConnection = {
    on: connectionEvents.on,
    createConfirmChannel: mockCreateConfirmChannel,
    createChannel: mockCreateChannel,
    close: mockCloseConnection,
};
const mockConnect = jest.fn<(url: string) => Promise<typeof fakeConnection>>();

jest.unstable_mockModule("amqplib", () => ({ default: { connect: mockConnect } }));
jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { rabbitMQConfig } = await import("../src/config/rabbitmq.js");

const command: SagaCommand = {
    type: "DEBIT_COMMAND",
    payload: { sagaId: "saga-1", senderId: "111", receiverId: "222", amount: 5, status: SagaStatus.PENDING },
};
const reply: SagaResponse = { type: "DEBIT_RESPONSE", payload: { sagaId: "saga-1", success: true } };

const message = (content: string, redelivered = false): FakeMessage => ({
    content: Buffer.from(content),
    fields: { redelivered },
});

// Starts consuming and returns the function RabbitMQ would call for each incoming message.
const startConsumer = async (callback: (msg: SagaResponse) => Promise<void>): Promise<Consumer> => {
    await rabbitMQConfig.consumeMessages("saga_response_queue", callback);
    const consumer = mockChannelConsume.mock.calls[0]?.[1];
    if (!consumer) throw new Error("no consumer was registered");
    return consumer;
};

beforeEach(async () => {
    mockConnect.mockResolvedValue(fakeConnection);
    mockCreateConfirmChannel.mockResolvedValue(publishChannel);
    mockCreateChannel.mockResolvedValue(consumeChannel);
    mockAssertQueue.mockResolvedValue(undefined);
    mockPrefetch.mockResolvedValue(undefined);
    mockChannelConsume.mockResolvedValue({ consumerTag: "tag-1" });
    mockSendToQueue.mockImplementation((_queue, _content, _options, done) => {
        done(null);
        return true;
    });
    mockCancel.mockImplementation(async () => void events.push("cancel"));
    mockAck.mockImplementation(() => void events.push("ack"));
    mockCloseConsumeChannel.mockImplementation(async () => void events.push("close consume channel"));
    mockClosePublishChannel.mockImplementation(async () => void events.push("close publish channel"));
    mockCloseConnection.mockImplementation(async () => void events.push("close connection"));
    rabbitMQConfig.publishTimeoutMs = 5000;
    rabbitMQConfig.drainTimeoutMs = 5000;
    await rabbitMQConfig.close();
    events.length = 0;
    jest.clearAllMocks();
});

describe("publishMessage", () => {
    it("sends the command as persistent JSON to a durable queue and resolves once the broker confirms", async () => {
        await rabbitMQConfig.publishMessage("debit_queue", command);

        expect(mockAssertQueue).toHaveBeenCalledWith("debit_queue", { durable: true });
        const [queue, content, options] = mockSendToQueue.mock.calls[0] ?? [];
        expect(queue).toBe("debit_queue");
        expect(JSON.parse(String(content))).toEqual(command);
        expect(options).toEqual({ persistent: true });
    });

    it("rejects when the broker refuses the message", async () => {
        mockSendToQueue.mockImplementation((_queue, _content, _options, done) => {
            done(new Error("message refused"));
            return true;
        });

        await expect(rabbitMQConfig.publishMessage("debit_queue", command)).rejects.toThrow("message refused");
    });

    it("rejects when the broker does not answer in time", async () => {
        mockSendToQueue.mockImplementation(() => true);
        rabbitMQConfig.publishTimeoutMs = 20;

        await expect(rabbitMQConfig.publishMessage("debit_queue", command)).rejects.toThrow(/did not confirm/);
    });

    it("declares each queue only once", async () => {
        await rabbitMQConfig.publishMessage("debit_queue", command);
        await rabbitMQConfig.publishMessage("debit_queue", command);
        expect(mockAssertQueue).toHaveBeenCalledTimes(1);
    });

    it("uses one connection and one channel even when several publishes start together", async () => {
        await Promise.all([
            rabbitMQConfig.publishMessage("debit_queue", command),
            rabbitMQConfig.publishMessage("credit_queue", command),
            rabbitMQConfig.publishMessage("refund_queue", command),
        ]);

        expect(mockConnect).toHaveBeenCalledTimes(1);
        expect(mockCreateConfirmChannel).toHaveBeenCalledTimes(1);
    });

    it("opens a new channel (and declares the queue again) after the broker closed the old one", async () => {
        await rabbitMQConfig.publishMessage("debit_queue", command);
        publishEvents.fire("close");
        await rabbitMQConfig.publishMessage("debit_queue", command);

        expect(mockCreateConfirmChannel).toHaveBeenCalledTimes(2);
        expect(mockAssertQueue).toHaveBeenCalledTimes(2);
    });

    it("tries to connect again after a failed attempt", async () => {
        mockConnect.mockRejectedValueOnce(new Error("connection refused"));

        await expect(rabbitMQConfig.publishMessage("debit_queue", command)).rejects.toThrow("connection refused");
        await expect(rabbitMQConfig.publishMessage("debit_queue", command)).resolves.toBeUndefined();
    });
});

describe("consumeMessages", () => {
    it("declares a durable queue and takes one message at a time", async () => {
        await startConsumer(async () => undefined);

        expect(mockAssertQueue).toHaveBeenCalledWith("saga_response_queue", { durable: true });
        expect(mockPrefetch).toHaveBeenCalledWith(1);
    });

    it("hands the parsed message to the callback and acknowledges it", async () => {
        const callback = jest.fn<(msg: SagaResponse) => Promise<void>>().mockResolvedValue(undefined);
        const consumer = await startConsumer(callback);
        const incoming = message(JSON.stringify(reply));

        await consumer(incoming);

        expect(callback).toHaveBeenCalledWith(reply);
        expect(mockAck).toHaveBeenCalledWith(incoming);
        expect(mockNack).not.toHaveBeenCalled();
    });

    it("acknowledges only after the callback has finished", async () => {
        let finish: () => void = () => undefined;
        const callback = jest.fn<(msg: SagaResponse) => Promise<void>>().mockReturnValue(
            new Promise<void>((resolve) => {
                finish = resolve;
            })
        );
        const consumer = await startConsumer(callback);

        const handling = consumer(message(JSON.stringify(reply)));
        await Promise.resolve();
        expect(mockAck).not.toHaveBeenCalled();

        finish();
        await handling;
        expect(mockAck).toHaveBeenCalledTimes(1);
    });

    it("puts a failed message back once so it gets a second chance", async () => {
        const callback = jest.fn<(msg: SagaResponse) => Promise<void>>().mockRejectedValue(new Error("mongo blip"));
        const consumer = await startConsumer(callback);
        const incoming = message(JSON.stringify(reply), false);

        await consumer(incoming);

        expect(mockNack).toHaveBeenCalledWith(incoming, false, true);
        expect(mockAck).not.toHaveBeenCalled();
    });

    it("drops a message that already failed once (no endless retry loop)", async () => {
        const callback = jest.fn<(msg: SagaResponse) => Promise<void>>().mockRejectedValue(new Error("still broken"));
        const consumer = await startConsumer(callback);
        const incoming = message(JSON.stringify(reply), true);

        await consumer(incoming);

        expect(mockNack).toHaveBeenCalledWith(incoming, false, false);
    });

    it("drops a message that is not valid JSON without calling the callback", async () => {
        const callback = jest.fn<(msg: SagaResponse) => Promise<void>>().mockResolvedValue(undefined);
        const consumer = await startConsumer(callback);
        const incoming = message("{not json");

        await consumer(incoming);

        expect(callback).not.toHaveBeenCalled();
        expect(mockNack).toHaveBeenCalledWith(incoming, false, false);
    });

    it("does not crash when the channel is already closed while rejecting a message", async () => {
        mockNack.mockImplementation(() => {
            throw new Error("Channel closed");
        });
        const callback = jest.fn<(msg: SagaResponse) => Promise<void>>().mockRejectedValue(new Error("boom"));
        const consumer = await startConsumer(callback);

        await expect(consumer(message(JSON.stringify(reply)))).resolves.toBeUndefined();
    });

    it("ignores the null that RabbitMQ sends when the consumer is cancelled", async () => {
        const callback = jest.fn<(msg: SagaResponse) => Promise<void>>().mockResolvedValue(undefined);
        const consumer = await startConsumer(callback);

        await consumer(null);

        expect(callback).not.toHaveBeenCalled();
        expect(mockAck).not.toHaveBeenCalled();
        expect(mockNack).not.toHaveBeenCalled();
    });
});

describe("close", () => {
    it("stops taking messages, lets the one in progress finish, then closes everything in order", async () => {
        let finish: () => void = () => undefined;
        const callback = jest.fn<(msg: SagaResponse) => Promise<void>>().mockReturnValue(
            new Promise<void>((resolve) => {
                finish = resolve;
            })
        );
        const consumer = await startConsumer(callback);
        await rabbitMQConfig.publishMessage("debit_queue", command);
        const handling = consumer(message(JSON.stringify(reply)));

        const closing = rabbitMQConfig.close();
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(events).toEqual(["cancel"]);

        finish();
        await handling;
        await closing;

        expect(events).toEqual(["cancel", "ack", "close consume channel", "close publish channel", "close connection"]);
    });

    it("stops waiting for a message that never finishes", async () => {
        rabbitMQConfig.drainTimeoutMs = 20;
        const consumer = await startConsumer(() => new Promise<void>(() => undefined));
        void consumer(message(JSON.stringify(reply)));

        await expect(rabbitMQConfig.close()).resolves.toBeUndefined();
        expect(events).toContain("close connection");
    });

    it("can be used again afterwards", async () => {
        await rabbitMQConfig.publishMessage("debit_queue", command);
        await rabbitMQConfig.close();
        await rabbitMQConfig.publishMessage("debit_queue", command);

        expect(mockConnect).toHaveBeenCalledTimes(2);
    });
});

describe("losing the broker", () => {
    it("exits so the service is restarted when the connection is lost", async () => {
        const exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        await rabbitMQConfig.publishMessage("debit_queue", command);

        connectionEvents.fire("close");

        expect(exit).toHaveBeenCalledWith(1);
    });

    it("exits when the broker closes the channel that receives the replies", async () => {
        const exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        await startConsumer(async () => undefined);

        consumeEvents.fire("close");

        expect(exit).toHaveBeenCalledWith(1);
    });

    it("keeps running when only the publish channel is closed (the next publish opens a new one)", async () => {
        const exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        await rabbitMQConfig.publishMessage("debit_queue", command);

        publishEvents.fire("close");

        expect(exit).not.toHaveBeenCalled();
    });

    it("does not exit because of its own close()", async () => {
        const exit = jest.spyOn(process, "exit").mockImplementation((() => undefined) as never);
        mockCloseConnection.mockImplementation(async () => connectionEvents.fire("close"));
        await rabbitMQConfig.publishMessage("debit_queue", command);

        await rabbitMQConfig.close();

        expect(exit).not.toHaveBeenCalled();
    });
});
