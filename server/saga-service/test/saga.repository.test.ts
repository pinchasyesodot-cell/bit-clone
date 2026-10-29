import { jest } from "@jest/globals";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { SagaRepository } from "../src/repository/saga.repository.js";
import { sagaModel } from "../src/models/sagaModel.js";
import { SagaStatus, type Saga } from "../src/interfaces/SagaType.js";

jest.setTimeout(120_000);

let mongod: MongoMemoryServer;

const makeSaga = (overrides: Partial<Saga> = {}): Saga => ({
    sagaId: "saga-1",
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

        const updated = await SagaRepository.transition("saga-1", [SagaStatus.PENDING], SagaStatus.PROCESSING);

        expect(updated?.status).toBe(SagaStatus.PROCESSING);
        expect((await sagaModel.findOne({ sagaId: "saga-1" }))?.status).toBe(SagaStatus.PROCESSING);
    });

    it("returns null and leaves the saga alone when it is in a different state", async () => {
        await SagaRepository.create(makeSaga({ status: SagaStatus.COMPENSATING }));

        const updated = await SagaRepository.transition("saga-1", [SagaStatus.PENDING], SagaStatus.PROCESSING);

        expect(updated).toBeNull();
        expect((await sagaModel.findOne({ sagaId: "saga-1" }))?.status).toBe(SagaStatus.COMPENSATING);
    });

    it("returns null for a saga that does not exist", async () => {
        const updated = await SagaRepository.transition("nope", [SagaStatus.PENDING], SagaStatus.PROCESSING);
        expect(updated).toBeNull();
    });

    it("lets exactly one of two racing transitions win", async () => {
        await SagaRepository.create(makeSaga({ status: SagaStatus.PROCESSING }));

        const results = await Promise.all([
            SagaRepository.transition("saga-1", [SagaStatus.PROCESSING], SagaStatus.COMPLETED),
            SagaRepository.transition("saga-1", [SagaStatus.PROCESSING], SagaStatus.COMPENSATING),
        ]);

        expect(results.filter((result) => result !== null)).toHaveLength(1);
    });
});

describe("SagaRepository.findTimedOut", () => {
    it("returns only sagas that are still open and have not moved for longer than the cutoff", async () => {
        await SagaRepository.create(makeSaga({ sagaId: "old-pending", status: SagaStatus.PENDING }));
        await SagaRepository.create(makeSaga({ sagaId: "old-processing", status: SagaStatus.PROCESSING }));
        await SagaRepository.create(makeSaga({ sagaId: "old-completed", status: SagaStatus.COMPLETED }));
        await SagaRepository.create(makeSaga({ sagaId: "old-compensating", status: SagaStatus.COMPENSATING }));
        await SagaRepository.create(makeSaga({ sagaId: "fresh-pending", status: SagaStatus.PENDING }));
        for (const sagaId of ["old-pending", "old-processing", "old-completed", "old-compensating"]) {
            await ageSaga(sagaId, 60);
        }

        const found = await SagaRepository.findTimedOut(new Date(Date.now() - 10_000));

        expect(found.map((saga) => saga.sagaId).sort()).toEqual(["old-pending", "old-processing"]);
    });
});
