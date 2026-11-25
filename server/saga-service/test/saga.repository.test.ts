import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { SagaRepository } from "../src/repository/saga.repository.js";
import { sagaModel } from "../src/models/sagaModel.js";
import { SagaStatus, type Saga } from "../src/interfaces/SagaType.js";

jest.setTimeout(120_000);

let mongod: MongoMemoryServer;

const SAGA_ID = "0193f2a4-6b1c-7d3e-a1b2-c3d4e5f60718";
const makeSaga = (overrides: Partial<Saga> = {}): Saga => ({
    sagaId: SAGA_ID,
    senderId: "111111111",
    receiverId: "222222222",
    amount: 100,
    status: SagaStatus.PENDING,
    ...overrides,
});

const ageSaga = async (sagaId: string, seconds: number): Promise<void> => {
    await sagaModel.collection.updateOne({ sagaId }, { $set: { updatedAt: new Date(Date.now() - seconds * 1000) } });
};

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await sagaModel.init();
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongod.stop();
});

beforeEach(async () => {
    await sagaModel.deleteMany({});
});

describe("SagaRepository.create", () => {
    it("stores the saga and returns it without database-internal fields", async () => {
        const saved = await SagaRepository.create(makeSaga());

        expect(saved).toEqual(makeSaga());
        expect(saved).not.toHaveProperty("_id");
        expect(saved).not.toHaveProperty("__v");
        expect(await sagaModel.countDocuments()).toBe(1);
    });

    it("refuses a second saga with the same sagaId", async () => {
        await SagaRepository.create(makeSaga());
        await expect(SagaRepository.create(makeSaga())).rejects.toMatchObject({ code: 11000 });
    });
});

describe("SagaRepository.transition", () => {
    it("moves the saga when it is in one of the allowed states", async () => {
        await SagaRepository.create(makeSaga());

        const updated = await SagaRepository.transition(SAGA_ID, [SagaStatus.PENDING], SagaStatus.PROCESSING);

        expect(updated?.status).toBe(SagaStatus.PROCESSING);
        expect((await sagaModel.findOne({ sagaId: SAGA_ID }))?.status).toBe(SagaStatus.PROCESSING);
    });

    it("returns null and leaves the saga alone when it is in a different state", async () => {
        await SagaRepository.create(makeSaga({ status: SagaStatus.COMPENSATING }));

        const updated = await SagaRepository.transition(SAGA_ID, [SagaStatus.PENDING], SagaStatus.PROCESSING);

        expect(updated).toBeNull();
        expect((await sagaModel.findOne({ sagaId: SAGA_ID }))?.status).toBe(SagaStatus.COMPENSATING);
    });

    it("returns null for a saga that does not exist", async () => {
        const updated = await SagaRepository.transition("nope", [SagaStatus.PENDING], SagaStatus.PROCESSING);
        expect(updated).toBeNull();
    });

    it("lets exactly one of two racing transitions win", async () => {
        await SagaRepository.create(makeSaga({ status: SagaStatus.PROCESSING }));

        const results = await Promise.all([
            SagaRepository.transition(SAGA_ID, [SagaStatus.PROCESSING], SagaStatus.COMPLETED),
            SagaRepository.transition(SAGA_ID, [SagaStatus.PROCESSING], SagaStatus.COMPENSATING),
        ]);

        expect(results.filter((result) => result !== null)).toHaveLength(1);
    });
});

describe("SagaRepository.findTimedOutOpenSagas", () => {
    it("returns only sagas that are still open and have not moved for longer than the cutoff", async () => {
        await SagaRepository.create(makeSaga({ sagaId: "old-pending", status: SagaStatus.PENDING }));
        await SagaRepository.create(makeSaga({ sagaId: "old-processing", status: SagaStatus.PROCESSING }));
        await SagaRepository.create(makeSaga({ sagaId: "old-completed", status: SagaStatus.COMPLETED }));
        await SagaRepository.create(makeSaga({ sagaId: "old-compensating", status: SagaStatus.COMPENSATING }));
        await SagaRepository.create(makeSaga({ sagaId: "fresh-pending", status: SagaStatus.PENDING }));
        for (const sagaId of ["old-pending", "old-processing", "old-completed", "old-compensating"]) {
            await ageSaga(sagaId, 60);
        }

        const found = await SagaRepository.findTimedOutOpenSagas(new Date(Date.now() - 10_000));

        expect(found.map((saga) => saga.sagaId).sort()).toEqual(["old-pending", "old-processing"]);
    });
});

describe("SagaRepository.findUnconfirmedRefunds", () => {
    it("returns only COMPENSATING sagas that have not moved for longer than the cutoff", async () => {
        await SagaRepository.create(makeSaga({ sagaId: "old-compensating", status: SagaStatus.COMPENSATING }));
        await SagaRepository.create(makeSaga({ sagaId: "fresh-compensating", status: SagaStatus.COMPENSATING }));
        await SagaRepository.create(makeSaga({ sagaId: "old-pending", status: SagaStatus.PENDING }));
        await SagaRepository.create(makeSaga({ sagaId: "old-failed", status: SagaStatus.FAILED }));
        for (const sagaId of ["old-compensating", "old-pending", "old-failed"]) {
            await ageSaga(sagaId, 60);
        }

        const found = await SagaRepository.findUnconfirmedRefunds(new Date(Date.now() - 10_000));

        expect(found.map((saga) => saga.sagaId)).toEqual(["old-compensating"]);
    });
});

describe("SagaRepository.refreshUpdatedAt", () => {
    it("refreshes updatedAt without changing the status", async () => {
        await SagaRepository.create(makeSaga({ status: SagaStatus.COMPENSATING }));
        await ageSaga(SAGA_ID, 60);
        const cutoff = new Date(Date.now() - 10_000);
        expect(await SagaRepository.findUnconfirmedRefunds(cutoff)).toHaveLength(1);

        const refreshed = await SagaRepository.refreshUpdatedAt(SAGA_ID, SagaStatus.COMPENSATING);

        expect(refreshed?.status).toBe(SagaStatus.COMPENSATING);
        expect(await SagaRepository.findUnconfirmedRefunds(cutoff)).toHaveLength(0);
    });

    it("returns null and changes nothing when the saga is in a different status", async () => {
        await SagaRepository.create(makeSaga({ status: SagaStatus.COMPLETED }));
        await ageSaga(SAGA_ID, 60);

        const refreshed = await SagaRepository.refreshUpdatedAt(SAGA_ID, SagaStatus.COMPENSATING);

        expect(refreshed).toBeNull();
        const stored = await sagaModel.collection.findOne({ sagaId: SAGA_ID });
        expect(Date.now() - new Date(stored?.updatedAt).getTime()).toBeGreaterThan(30_000);
    });
});

describe("idempotency key index", () => {
    const KEY = "0193f2a4-6b1c-7d3e-a1b2-c3d4e5f60718";
    const base = { receiverId: "987654321", amount: 100, status: SagaStatus.PENDING };

    it("rejects a second saga with the same key from the same sender", async () => {
        await SagaRepository.create({ ...base, sagaId: "s-1", senderId: "111111111", idempotencyKey: KEY });

        await expect(
            SagaRepository.create({ ...base, sagaId: "s-2", senderId: "111111111", idempotencyKey: KEY })
        ).rejects.toMatchObject({ code: 11000 });
    });

    it("allows the same key for different senders", async () => {
        await SagaRepository.create({ ...base, sagaId: "s-1", senderId: "111111111", idempotencyKey: KEY });

        await expect(
            SagaRepository.create({ ...base, sagaId: "s-2", senderId: "222222222", idempotencyKey: KEY })
        ).resolves.toBeDefined();
    });

    it("allows any number of sagas without a key from the same sender", async () => {
        await SagaRepository.create({ ...base, sagaId: "s-1", senderId: "111111111" });

        await expect(SagaRepository.create({ ...base, sagaId: "s-2", senderId: "111111111" })).resolves.toBeDefined();
    });

    it("finds a saga by sender and key, and not by another sender", async () => {
        await SagaRepository.create({ ...base, sagaId: "s-1", senderId: "111111111", idempotencyKey: KEY });

        expect((await SagaRepository.findByIdempotencyKey("111111111", KEY))?.sagaId).toBe("s-1");
        expect(await SagaRepository.findByIdempotencyKey("222222222", KEY)).toBeNull();
    });
});
