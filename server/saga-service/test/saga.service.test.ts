import { jest } from "@jest/globals";
import { SagaStatus, type AccountsSagaState, type Saga, type SagaResponse } from "../src/interfaces/SagaType.js";

type ResponseHandler = (msg: SagaResponse) => Promise<void>;

const mockPublish = jest.fn<(queue: string, message: unknown) => Promise<boolean>>();
const mockConsume = jest.fn<(queue: string, handler: ResponseHandler) => Promise<void>>();
const mockCreate = jest.fn<(saga: Saga) => Promise<Saga>>();
const mockTransition = jest.fn<(sagaId: string, from: SagaStatus[], to: SagaStatus) => Promise<Saga | null>>();
const mockFindTimedOut = jest.fn<(cutoff: Date) => Promise<Saga[]>>();
const mockEmit = jest.fn<(userId: string, event: string, data: unknown) => void>();
const mockAccountsGet = jest.fn<(url: string) => Promise<{ data: AccountsSagaState }>>();

jest.unstable_mockModule("../src/config/rabbitmq.js", () => ({
    rabbitMQConfig: { publishMessage: mockPublish, consumeMessages: mockConsume },
}));
jest.unstable_mockModule("../src/repository/saga.repository.js", () => ({
    SagaRepository: { create: mockCreate, transition: mockTransition, findTimedOut: mockFindTimedOut },
}));
jest.unstable_mockModule("../src/service/socket.service.js", () => ({
    default: { emitToUser: mockEmit },
}));
jest.unstable_mockModule("../src/api/base.api.js", () => ({
    api: { get: mockAccountsGet },
}));
jest.unstable_mockModule("../src/utils/logger.js", () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { SagaService } = await import("../src/service/saga.service.js");

const SENDER = "111111111";
const OPEN = [SagaStatus.PENDING, SagaStatus.PROCESSING];

const makeSaga = (overrides: Partial<Saga> = {}): Saga => ({
    sagaId: "saga-1",
    senderId: SENDER,
    receiverId: "222222222",
    amount: 100,
    status: SagaStatus.PENDING,
    ...overrides,
});

const accountsSays = (state: Partial<AccountsSagaState>) => ({
    data: { debited: false, credited: false, refunded: false, ...state },
});

const receive = async (type: SagaResponse["type"], success: boolean, sagaId = "saga-1"): Promise<void> => {
    await SagaService.consumeSagaMessages();
    const handler = mockConsume.mock.calls[0]?.[1];
    if (!handler) throw new Error("consumeSagaMessages did not register a handler");
    await handler({ type, payload: { sagaId, success } });
};

beforeEach(() => {
    SagaService.isProcessing = false;
    mockConsume.mockResolvedValue(undefined);
    mockPublish.mockResolvedValue(true);
    mockCreate.mockImplementation(async (saga) => saga);
    mockTransition.mockImplementation(async (sagaId, _from, to) => makeSaga({ sagaId, status: to }));
    mockFindTimedOut.mockResolvedValue([]);
});

describe("createSaga", () => {
    it("stores a PENDING saga and asks the accounts service to debit the sender", async () => {
        const saga = await SagaService.createSaga({ senderId: SENDER, receiverId: "222222222", amount: 100 });

        expect(saga.status).toBe(SagaStatus.PENDING);
        expect(saga.sagaId).toMatch(/^[0-9a-f-]{36}$/);
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ senderId: SENDER, status: "PENDING" }));
        expect(mockPublish).toHaveBeenCalledWith("debit_queue", { type: "DEBIT_COMMAND", payload: saga });
    });

    it("refuses to send money to yourself and touches nothing", async () => {
        await expect(SagaService.createSaga({ senderId: SENDER, receiverId: SENDER, amount: 5 })).rejects.toMatchObject(
            {
                statusCode: 400,
            }
        );
        expect(mockCreate).not.toHaveBeenCalled();
        expect(mockPublish).not.toHaveBeenCalled();
    });
});

describe("consuming replies: the happy path", () => {
    it("listens on saga_response_queue", async () => {
        await SagaService.consumeSagaMessages();
        expect(mockConsume.mock.calls[0]?.[0]).toBe("saga_response_queue");
    });

    it("DEBIT ok: moves to PROCESSING, asks to credit the receiver, tells the user", async () => {
        await receive("DEBIT_RESPONSE", true);

        expect(mockTransition).toHaveBeenCalledWith("saga-1", [SagaStatus.PENDING], SagaStatus.PROCESSING);
        const processing = makeSaga({ status: SagaStatus.PROCESSING });
        expect(mockPublish).toHaveBeenCalledWith("credit_queue", { type: "CREDIT_COMMAND", payload: processing });
        expect(mockEmit).toHaveBeenCalledWith(SENDER, "saga:processing", processing);
    });

    it("CREDIT ok: completes the saga and tells the user", async () => {
        await receive("CREDIT_RESPONSE", true);

        expect(mockTransition).toHaveBeenCalledWith(
            "saga-1",
            [SagaStatus.PROCESSING, SagaStatus.COMPENSATING],
            SagaStatus.COMPLETED
        );
        expect(mockEmit).toHaveBeenCalledWith(SENDER, "saga:completed", makeSaga({ status: SagaStatus.COMPLETED }));
        expect(mockPublish).not.toHaveBeenCalled();
    });
});

describe("consuming replies: failures and the refund flow", () => {
    it("DEBIT failed: marks the saga FAILED and never asks to credit anyone", async () => {
        await receive("DEBIT_RESPONSE", false);

        expect(mockTransition).toHaveBeenCalledWith("saga-1", [SagaStatus.PENDING], SagaStatus.FAILED);
        expect(mockPublish).not.toHaveBeenCalled();
        expect(mockEmit).toHaveBeenCalledWith(SENDER, "saga:failed", makeSaga({ status: SagaStatus.FAILED }));
    });

    it("CREDIT failed: moves to COMPENSATING and sends a REFUND_COMMAND to give the sender the money back", async () => {
        await receive("CREDIT_RESPONSE", false);

        expect(mockTransition).toHaveBeenCalledWith("saga-1", [SagaStatus.PROCESSING], SagaStatus.COMPENSATING);
        const compensating = makeSaga({ status: SagaStatus.COMPENSATING });
        expect(mockPublish).toHaveBeenCalledWith("refund_queue", { type: "REFUND_COMMAND", payload: compensating });
        expect(mockEmit).toHaveBeenCalledWith(SENDER, "saga:compensating", compensating);
    });

    it("REFUND ok: the saga ends FAILED (money is back with the sender)", async () => {
        await receive("REFUND_RESPONSE", true);

        expect(mockTransition).toHaveBeenCalledWith("saga-1", [SagaStatus.COMPENSATING], SagaStatus.FAILED);
        expect(mockEmit).toHaveBeenCalledWith(SENDER, "saga:failed", makeSaga({ status: SagaStatus.FAILED }));
    });

    it("REFUND failed: changes nothing, so the saga stays COMPENSATING", async () => {
        await receive("REFUND_RESPONSE", false);

        expect(mockTransition).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();
    });

    it("ignores an unknown message type", async () => {
        await SagaService.consumeSagaMessages();
        const handler = mockConsume.mock.calls[0]?.[1];
        await handler?.({
            type: "SOMETHING_ELSE" as SagaResponse["type"],
            payload: { sagaId: "saga-1", success: true },
        });

        expect(mockTransition).not.toHaveBeenCalled();
        expect(mockPublish).not.toHaveBeenCalled();
    });
});

describe("consuming replies: stale or duplicate messages are ignored", () => {
    beforeEach(() => {
        mockTransition.mockResolvedValue(null);
    });

    it("a late DEBIT reply does not trigger a credit", async () => {
        await receive("DEBIT_RESPONSE", true);
        expect(mockPublish).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();
    });

    it("a late failed-DEBIT reply is ignored", async () => {
        await receive("DEBIT_RESPONSE", false);
        expect(mockEmit).not.toHaveBeenCalled();
    });

    it("a late failed-CREDIT reply does not send a second refund", async () => {
        await receive("CREDIT_RESPONSE", false);
        expect(mockPublish).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();
    });

    it("a duplicate CREDIT ok reply does not announce completion twice", async () => {
        await receive("CREDIT_RESPONSE", true);
        expect(mockEmit).not.toHaveBeenCalled();
    });

    it("a duplicate REFUND ok reply does not announce failure twice", async () => {
        await receive("REFUND_RESPONSE", true);
        expect(mockEmit).not.toHaveBeenCalled();
    });
});

describe("handleTimeouts (a service did not reply within 10 seconds)", () => {
    const stuck = (overrides: Partial<Saga> = {}) => makeSaga({ status: SagaStatus.PROCESSING, ...overrides });

    it("waits exactly 10 seconds before treating a saga as stuck", async () => {
        expect(SagaService.SAGA_TIMEOUT_MS).toBe(10_000);

        const before = Date.now();
        await SagaService.handleTimeouts();
        const after = Date.now();

        const cutoff = mockFindTimedOut.mock.calls[0]?.[0];
        expect(cutoff).toBeInstanceOf(Date);
        expect(cutoff?.getTime()).toBeGreaterThanOrEqual(before - 10_000);
        expect(cutoff?.getTime()).toBeLessThanOrEqual(after - 10_000);
    });

    it("sends a refund when the accounts service says the money was taken but not delivered", async () => {
        mockFindTimedOut.mockResolvedValue([stuck()]);
        mockAccountsGet.mockResolvedValue(accountsSays({ debited: true }));

        await SagaService.handleTimeouts();

        expect(mockAccountsGet).toHaveBeenCalledWith("/saga-1");
        expect(mockTransition).toHaveBeenCalledWith("saga-1", OPEN, SagaStatus.COMPENSATING);
        const compensating = makeSaga({ status: SagaStatus.COMPENSATING });
        expect(mockPublish).toHaveBeenCalledWith("refund_queue", { type: "REFUND_COMMAND", payload: compensating });
        expect(mockEmit).toHaveBeenCalledWith(SENDER, "saga:compensating", compensating);
    });

    it("completes the saga when the credit really happened and only the reply was lost", async () => {
        mockFindTimedOut.mockResolvedValue([stuck()]);
        mockAccountsGet.mockResolvedValue(accountsSays({ debited: true, credited: true }));

        await SagaService.handleTimeouts();

        expect(mockTransition).toHaveBeenCalledWith("saga-1", OPEN, SagaStatus.COMPLETED);
        expect(mockEmit).toHaveBeenCalledWith(SENDER, "saga:completed", makeSaga({ status: SagaStatus.COMPLETED }));
        expect(mockPublish).not.toHaveBeenCalled();
    });

    it("fails the saga when the accounts service already refunded it", async () => {
        mockFindTimedOut.mockResolvedValue([stuck()]);
        mockAccountsGet.mockResolvedValue(accountsSays({ debited: true, refunded: true }));

        await SagaService.handleTimeouts();

        expect(mockTransition).toHaveBeenCalledWith("saga-1", OPEN, SagaStatus.FAILED);
        expect(mockPublish).not.toHaveBeenCalled();
    });

    it("changes nothing when the accounts service cannot be reached (never refunds blindly)", async () => {
        mockFindTimedOut.mockResolvedValue([stuck()]);
        mockAccountsGet.mockRejectedValue(new Error("connect ECONNREFUSED"));

        await SagaService.handleTimeouts();

        expect(mockTransition).not.toHaveBeenCalled();
        expect(mockPublish).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();
    });

    it("keeps going with the other sagas when one of them fails", async () => {
        mockFindTimedOut.mockResolvedValue([stuck({ sagaId: "saga-1" }), stuck({ sagaId: "saga-2" })]);
        mockAccountsGet
            .mockRejectedValueOnce(new Error("timeout of 5000ms exceeded"))
            .mockResolvedValueOnce(accountsSays({ debited: true }));

        await SagaService.handleTimeouts();

        expect(mockTransition).toHaveBeenCalledTimes(1);
        expect(mockTransition).toHaveBeenCalledWith("saga-2", OPEN, SagaStatus.COMPENSATING);
    });

    it("does nothing for a saga that moved on while we were checking it", async () => {
        mockFindTimedOut.mockResolvedValue([stuck()]);
        mockAccountsGet.mockResolvedValue(accountsSays({ debited: true }));
        mockTransition.mockResolvedValue(null);

        await SagaService.handleTimeouts();

        expect(mockPublish).not.toHaveBeenCalled();
        expect(mockEmit).not.toHaveBeenCalled();
    });

    it("survives a database failure and can run again afterwards", async () => {
        mockFindTimedOut.mockRejectedValueOnce(new Error("mongo is down"));
        await expect(SagaService.handleTimeouts()).resolves.toBeUndefined();
        expect(SagaService.isProcessing).toBe(false);
    });

    it("never runs two checks at the same time", async () => {
        let release: (sagas: Saga[]) => void = () => undefined;
        mockFindTimedOut.mockReturnValue(
            new Promise<Saga[]>((resolve) => {
                release = resolve;
            })
        );

        const first = SagaService.handleTimeouts();
        await SagaService.handleTimeouts();
        release([]);
        await first;

        expect(mockFindTimedOut).toHaveBeenCalledTimes(1);
    });
});
