import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AccountService } from "../src/services/account.service.js";
import { AccountModel } from "../src/models/account.model.js";
import { AccountSagaModel } from "../src/models/accountSaga.model.js";
import { AccountError, AccountStatus, AccountType, StepStatus } from "../src/interfaces/account.types.js";
import { ALREADY_CREDITED, SagaStatus, type Saga } from "../src/interfaces/saga.type.js";

jest.setTimeout(120_000);

let replSet: MongoMemoryReplSet;

const SENDER = "1";
const RECEIVER = "2";
const OPENING_BALANCE = 100_000;

const makeSaga = (overrides: Partial<Saga> = {}): Saga => ({
    sagaId: "saga-1",
    senderId: SENDER,
    receiverId: RECEIVER,
    amount: 500,
    status: SagaStatus.PENDING,
    ...overrides,
});

const balanceOf = async (userId: string): Promise<number | undefined> =>
    (await AccountModel.findOne({ userId }).lean())?.balance;

const cardOf = async (sagaId = "saga-1") => AccountSagaModel.findOne({ sagaId }).lean();

const setStatus = async (userId: string, status: AccountStatus): Promise<void> => {
    await AccountModel.updateOne({ userId }, { $set: { status } });
};

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    await mongoose.connect(replSet.getUri());
    await AccountModel.init();
    await AccountSagaModel.init();
});

afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
});

beforeEach(async () => {
    await AccountModel.deleteMany({});
    await AccountSagaModel.deleteMany({});
    await AccountModel.create([
        { accountNumber: "1000001", userId: SENDER, balance: OPENING_BALANCE, type: AccountType.CHECKING },
        { accountNumber: "1000002", userId: RECEIVER, balance: 0, type: AccountType.CHECKING },
    ]);
});

describe("handleDebit", () => {
    it("takes the amount from the sender and marks the debit as done", async () => {
        const result = await AccountService.handleDebit(makeSaga());

        expect(result).toEqual({ success: true });
        expect(await balanceOf(SENDER)).toBe(99_500);
        expect((await cardOf())?.debit).toBe(StepStatus.COMPLETED);
    });

    it("does not take the money twice when the same command arrives again", async () => {
        await AccountService.handleDebit(makeSaga());
        const second = await AccountService.handleDebit(makeSaga());

        expect(second).toEqual({ success: true });
        expect(await balanceOf(SENDER)).toBe(99_500);
    });

    it("does not take the money twice when the same command arrives twice at the same time", async () => {
        const results = await Promise.all([
            AccountService.handleDebit(makeSaga()),
            AccountService.handleDebit(makeSaga()),
        ]);

        expect(results).toEqual([{ success: true }, { success: true }]);
        expect(await balanceOf(SENDER)).toBe(99_500);
    });

    it("rejects when the balance is too low and records the reason", async () => {
        const result = await AccountService.handleDebit(makeSaga({ amount: OPENING_BALANCE + 1 }));

        expect(result).toEqual({ success: false, error: AccountError.INSUFFICIENT_FUNDS });
        expect(await balanceOf(SENDER)).toBe(OPENING_BALANCE);

        const card = await cardOf();
        expect(card?.debit).toBe(StepStatus.FAILED);
        expect(card?.debitError).toBe(AccountError.INSUFFICIENT_FUNDS);
    });

    it("keeps rejecting a failed debit even if the balance grows before the command is redelivered", async () => {
        const saga = makeSaga({ amount: OPENING_BALANCE + 1 });
        await AccountService.handleDebit(saga);
        await AccountModel.updateOne({ userId: SENDER }, { $inc: { balance: 1_000 } });

        const retry = await AccountService.handleDebit(saga);

        expect(retry).toEqual({ success: false, error: AccountError.INSUFFICIENT_FUNDS });
        expect(await balanceOf(SENDER)).toBe(OPENING_BALANCE + 1_000);
    });

    it("rejects when the sender account is frozen", async () => {
        await setStatus(SENDER, AccountStatus.FROZEN);

        const result = await AccountService.handleDebit(makeSaga());

        expect(result).toEqual({ success: false, error: AccountError.ACCOUNT_FROZEN });
        expect(await balanceOf(SENDER)).toBe(OPENING_BALANCE);
    });

    it("rejects when the sender has no account", async () => {
        const result = await AccountService.handleDebit(makeSaga({ senderId: "999" }));

        expect(result).toEqual({ success: false, error: AccountError.ACCOUNT_NOT_FOUND });
    });

    it("refuses a debit that arrives after the saga was already refunded (the money would be lost)", async () => {
        await AccountService.handleRefund(makeSaga());

        const result = await AccountService.handleDebit(makeSaga());

        expect(result).toEqual({ success: false, error: AccountError.SAGA_CANCELLED });
        expect(await balanceOf(SENDER)).toBe(OPENING_BALANCE);
        expect((await cardOf())?.debit).toBe(StepStatus.FAILED);
    });
});

describe("handleCredit", () => {
    it("gives the amount to the receiver after the debit", async () => {
        await AccountService.handleDebit(makeSaga());

        const result = await AccountService.handleCredit(makeSaga());

        expect(result).toEqual({ success: true });
        expect(await balanceOf(RECEIVER)).toBe(500);
        expect((await cardOf())?.credit).toBe(StepStatus.COMPLETED);
    });

    it("does not give the money twice when the same command arrives again", async () => {
        await AccountService.handleDebit(makeSaga());
        await AccountService.handleCredit(makeSaga());

        const second = await AccountService.handleCredit(makeSaga());

        expect(second).toEqual({ success: true });
        expect(await balanceOf(RECEIVER)).toBe(500);
    });

    it("rejects when the receiver account is frozen and keeps that answer after it is unfrozen", async () => {
        await AccountService.handleDebit(makeSaga());
        await setStatus(RECEIVER, AccountStatus.FROZEN);

        const result = await AccountService.handleCredit(makeSaga());
        expect(result).toEqual({ success: false, error: AccountError.ACCOUNT_FROZEN });

        await setStatus(RECEIVER, AccountStatus.ACTIVE);
        const retry = await AccountService.handleCredit(makeSaga());

        expect(retry).toEqual({ success: false, error: AccountError.ACCOUNT_FROZEN });
        expect(await balanceOf(RECEIVER)).toBe(0);
    });

    it("refuses a credit that arrives after the refund (the money would be created twice)", async () => {
        await AccountService.handleDebit(makeSaga());
        await AccountService.handleRefund(makeSaga());

        const result = await AccountService.handleCredit(makeSaga());

        expect(result).toEqual({ success: false, error: AccountError.ALREADY_REFUNDED });
        expect(await balanceOf(SENDER)).toBe(OPENING_BALANCE);
        expect(await balanceOf(RECEIVER)).toBe(0);
    });

    it("rejects a credit when the debit has not completed, and moves no money", async () => {
        const result = await AccountService.handleCredit(makeSaga());

        expect(result).toEqual({ success: false, error: AccountError.DEBIT_NOT_COMPLETED });
        expect(await balanceOf(RECEIVER)).toBe(0);
        const card = await cardOf();
        expect(card?.credit).toBe(StepStatus.FAILED);
        expect(card?.creditError).toBe(AccountError.DEBIT_NOT_COMPLETED);
    });

    it("rejects a credit when the debit failed", async () => {
        await AccountService.handleDebit(makeSaga({ amount: OPENING_BALANCE + 1 }));

        const result = await AccountService.handleCredit(makeSaga({ amount: OPENING_BALANCE + 1 }));

        expect(result).toEqual({ success: false, error: AccountError.DEBIT_NOT_COMPLETED });
        expect(await balanceOf(RECEIVER)).toBe(0);
    });
});

describe("handleRefund", () => {
    it("returns the money to the sender after a debit", async () => {
        await AccountService.handleDebit(makeSaga());

        const result = await AccountService.handleRefund(makeSaga());

        expect(result).toEqual({ success: true });
        expect(await balanceOf(SENDER)).toBe(OPENING_BALANCE);
        expect((await cardOf())?.refund).toBe(StepStatus.COMPLETED);
    });

    it("does not refund twice when the same command arrives again", async () => {
        await AccountService.handleDebit(makeSaga());
        await AccountService.handleRefund(makeSaga());

        const second = await AccountService.handleRefund(makeSaga());

        expect(second).toEqual({ success: true });
        expect(await balanceOf(SENDER)).toBe(OPENING_BALANCE);
    });

    it("answers ALREADY_CREDITED and moves no money when the credit already happened", async () => {
        await AccountService.handleDebit(makeSaga());
        await AccountService.handleCredit(makeSaga());

        const result = await AccountService.handleRefund(makeSaga());

        expect(result).toEqual({ success: false, error: ALREADY_CREDITED });
        expect(await balanceOf(SENDER)).toBe(99_500);
        expect(await balanceOf(RECEIVER)).toBe(500);
    });

    it("succeeds without touching the balance when the debit never happened", async () => {
        const result = await AccountService.handleRefund(makeSaga());

        expect(result).toEqual({ success: true });
        expect(await balanceOf(SENDER)).toBe(OPENING_BALANCE);
        expect((await cardOf())?.refund).toBe(StepStatus.COMPLETED);
    });

    it("succeeds without touching the balance when the debit failed", async () => {
        await AccountService.handleDebit(makeSaga({ amount: OPENING_BALANCE + 1 }));

        const result = await AccountService.handleRefund(makeSaga({ amount: OPENING_BALANCE + 1 }));

        expect(result).toEqual({ success: true });
        expect(await balanceOf(SENDER)).toBe(OPENING_BALANCE);
    });

    it("returns the money even when the sender account is frozen", async () => {
        await AccountService.handleDebit(makeSaga());
        await setStatus(SENDER, AccountStatus.FROZEN);

        const result = await AccountService.handleRefund(makeSaga());

        expect(result).toEqual({ success: true });
        expect(await balanceOf(SENDER)).toBe(OPENING_BALANCE);
    });

    it("refunds the amount stored at debit time, not the amount in the refund command", async () => {
        await AccountService.handleDebit(makeSaga({ amount: 500 }));

        await AccountService.handleRefund(makeSaga({ amount: 50_000 }));

        expect(await balanceOf(SENDER)).toBe(OPENING_BALANCE);
    });
});

describe("credit and refund racing for the same saga", () => {
    it("lets exactly one of them win, so no money is created or lost", async () => {
        await AccountService.handleDebit(makeSaga());

        const [credit, refund] = await Promise.all([
            AccountService.handleCredit(makeSaga()),
            AccountService.handleRefund(makeSaga()),
        ]);

        expect([credit.success, refund.success].filter(Boolean)).toHaveLength(1);
        const total = (await balanceOf(SENDER))! + (await balanceOf(RECEIVER))!;
        expect(total).toBe(OPENING_BALANCE);
    });
});

describe("getSagaState", () => {
    it("reports nothing done for a saga this service never saw", async () => {
        expect(await AccountService.getSagaState("unknown")).toEqual({
            debited: false,
            credited: false,
            refunded: false,
        });
    });

    it("reports the steps that were completed", async () => {
        await AccountService.handleDebit(makeSaga());
        await AccountService.handleRefund(makeSaga());

        expect(await AccountService.getSagaState("saga-1")).toEqual({
            debited: true,
            credited: false,
            refunded: true,
        });
    });
});
