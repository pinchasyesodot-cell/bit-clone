import { jest } from "@jest/globals";
import { SagaStatus, type SagaCommand, type SagaResponse } from "../src/interfaces/SagaType.js";

type FakeMessage = { content: Buffer; fields: { redelivered: boolean } };
type Consumer = (msg: FakeMessage | null) => Promise<void>;

const mockAssertQueue = jest.fn<(queue: string, options: unknown) => Promise<void>>();
const mockPrefetch = jest.fn<(count: number) => Promise<void>>();
const mockChannelConsume = jest.fn<(queue: string, consumer: Consumer) => Promise<void>>();
const mockSendToQueue = jest.fn<(queue: string, content: Buffer, options: unknown) => boolean>();
const mockAck = jest.fn<(msg: FakeMessage) => void>();
const mockNack = jest.fn<(msg: FakeMessage, allUpTo: boolean, requeue: boolean) => void>();

const fakeChannel = {
    assertQueue: mockAssertQueue,
    prefetch: mockPrefetch,
    consume: mockChannelConsume,
    sendToQueue: mockSendToQueue,
    ack: mockAck,
    nack: mockNack,
};
const mockConnect = jest.fn<(url: string) => Promise<{ createChannel: () => Promise<typeof fakeChannel> }>>();

jest.unstable_mockModule("amqplib", () => ({ default: { connect: mockConnect } }));
jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { rabbitMQConfig } = await import("../src/config/rabbitmq.js");

const reply: SagaResponse = { type: "DEBIT_RESPONSE", payload: { sagaId: "saga-1", success: true } };

const message = (content: string, redelivered = false): FakeMessage => ({
    content: Buffer.from(content),
    fields: { redelivered },
});

const startConsumer = async (callback: (msg: SagaResponse) => Promise<void>): Promise<Consumer> => {
    await rabbitMQConfig.consumeMessages("saga_response_queue", callback);
    const consumer = mockChannelConsume.mock.calls[0]?.[1];
    if (!consumer) throw new Error("no consumer was registered");
    return consumer;
};

beforeEach(() => {
    mockConnect.mockResolvedValue({ createChannel: async () => fakeChannel });
    mockAssertQueue.mockResolvedValue(undefined);
    mockPrefetch.mockResolvedValue(undefined);
    mockChannelConsume.mockResolvedValue(undefined);
    mockSendToQueue.mockReturnValue(true);
});

describe("publishMessage", () => {
    const command: SagaCommand = {
        type: "DEBIT_COMMAND",
        payload: { sagaId: "saga-1", senderId: "111", receiverId: "222", amount: 5, status: SagaStatus.PENDING },
    };

    it("sends the command as persistent JSON to a durable queue", async () => {
        await rabbitMQConfig.publishMessage("debit_queue", command);

        expect(mockAssertQueue).toHaveBeenCalledWith("debit_queue", { durable: true });
        const [queue, content, options] = mockSendToQueue.mock.calls[0] ?? [];
        expect(queue).toBe("debit_queue");
        expect(JSON.parse(String(content))).toEqual(command);
        expect(options).toEqual({ persistent: true });
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

    it("ignores the null that RabbitMQ sends when the consumer is cancelled", async () => {
        const callback = jest.fn<(msg: SagaResponse) => Promise<void>>().mockResolvedValue(undefined);
        const consumer = await startConsumer(callback);

        await consumer(null);

        expect(callback).not.toHaveBeenCalled();
        expect(mockAck).not.toHaveBeenCalled();
        expect(mockNack).not.toHaveBeenCalled();
    });
});
