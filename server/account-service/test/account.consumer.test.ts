import { jest } from "@jest/globals";
import type { Saga, SagaResponse } from "../src/interfaces/saga.type.js";
import type { StepResult } from "../src/interfaces/account.types.js";

type Handler = (msg: unknown) => Promise<void>;

const publishMessage = jest.fn<(queue: string, message: SagaResponse) => Promise<void>>();
const consumeMessages = jest.fn<(queue: string, handler: Handler) => Promise<void>>();
const handleDebit = jest.fn<(saga: Saga) => Promise<StepResult>>();
const openAccount = jest.fn<(userId: string) => Promise<boolean>>();

jest.unstable_mockModule("../src/config/rabbitmq.js", () => ({
    rabbitMQConfig: { publishMessage, consumeMessages },
}));
jest.unstable_mockModule("../src/services/account.service.js", () => ({
    AccountService: { handleDebit, handleCredit: jest.fn(), handleRefund: jest.fn(), openAccount },
}));

const { startConsumers } = await import("../src/consumers/account.consumer.js");
const { InvalidMessageError } = await import("../src/utils/InvalidMessageError.js");

const SAGA_ID = "0b8e4c1a-7f2d-4a51-9c3e-5d6f7a8b9c0d";
const debit = {
    type: "DEBIT_COMMAND",
    payload: { sagaId: SAGA_ID, senderId: "123456789", receiverId: "987654321", amount: 500, status: "PENDING" },
};

const handlers = new Map<string, Handler>();

beforeAll(async () => {
    consumeMessages.mockResolvedValue(undefined);
    await startConsumers();
    for (const [queue, handler] of consumeMessages.mock.calls) handlers.set(queue, handler);
});

beforeEach(() => {
    publishMessage.mockResolvedValue(undefined);
});

const handlerFor = (queue: string): Handler => {
    const handler = handlers.get(queue);
    if (!handler) throw new Error(`No consumer registered for ${queue}`);
    return handler;
};

describe("saga commands", () => {
    it("runs the debit and answers saga with DEBIT_RESPONSE for the same saga", async () => {
        handleDebit.mockResolvedValue({ success: true });

        await handlerFor("debit_queue")(debit);

        expect(handleDebit).toHaveBeenCalledWith(debit.payload);
        expect(publishMessage).toHaveBeenCalledWith("saga_response_queue", {
            type: "DEBIT_RESPONSE",
            payload: { sagaId: SAGA_ID, success: true },
        });
    });

    it("passes the rejection reason on to saga", async () => {
        handleDebit.mockResolvedValue({ success: false, error: "INSUFFICIENT_FUNDS" });

        await handlerFor("debit_queue")(debit);

        expect(publishMessage).toHaveBeenCalledWith("saga_response_queue", {
            type: "DEBIT_RESPONSE",
            payload: { sagaId: SAGA_ID, success: false, error: "INSUFFICIENT_FUNDS" },
        });
    });

    it.each([
        ["a negative amount", { ...debit, payload: { ...debit.payload, amount: -500 } }],
        ["a command sent to the wrong queue", { ...debit, type: "CREDIT_COMMAND" }],
    ])("rejects %s before it reaches the service", async (_case, message) => {
        await expect(handlerFor("debit_queue")(message)).rejects.toBeInstanceOf(InvalidMessageError);

        expect(handleDebit).not.toHaveBeenCalled();
        expect(publishMessage).not.toHaveBeenCalled();
    });
});

describe("user created events", () => {
    it("opens an account for the new user", async () => {
        openAccount.mockResolvedValue(true);

        await handlerFor("user_created_queue")({ type: "USER_CREATED", payload: { userId: "123456789" } });

        expect(openAccount).toHaveBeenCalledWith("123456789");
    });

    it("rejects an invalid event before it reaches the service", async () => {
        await expect(
            handlerFor("user_created_queue")({ type: "USER_CREATED", payload: { userId: 123456789 } })
        ).rejects.toBeInstanceOf(InvalidMessageError);

        expect(openAccount).not.toHaveBeenCalled();
    });
});
