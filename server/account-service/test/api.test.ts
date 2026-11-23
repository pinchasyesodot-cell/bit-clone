import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import app from "../src/server.js";
import { AccountModel } from "../src/models/account.model.js";
import { AccountType } from "../src/interfaces/account.types.js";
import { jest } from "@jest/globals";

jest.setTimeout(120_000);

let replSet: MongoMemoryReplSet;

const USER_ID = 123456789;
const SECRET = process.env.JWT_SECRET!;
const INTERNAL_KEY = process.env.INTERNAL_API_KEY!;
const SAGA_ID = "0b8e4c1a-7f2d-4a51-9c3e-5d6f7a8b9c0d";

const tokenFor = (userId: number, options: jwt.SignOptions = {}, secret = SECRET): string =>
    jwt.sign({ userId }, secret, { algorithm: "HS256", expiresIn: "1h", ...options });

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    await mongoose.connect(replSet.getUri());
    await AccountModel.init();
});

afterAll(async () => {
    await mongoose.disconnect();
    await replSet.stop();
});

beforeEach(async () => {
    await AccountModel.deleteMany({});
    await AccountModel.create({
        accountNumber: "100000000001",
        userId: String(USER_ID),
        balance: 2_500,
        type: AccountType.CHECKING,
    });
});

describe("GET /api/accounts/me", () => {
    it("returns the account of the logged-in user, without internal fields", async () => {
        const res = await request(app)
            .get("/api/accounts/me")
            .set("Authorization", `Bearer ${tokenFor(USER_ID)}`);

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ userId: String(USER_ID), balance: 2_500, accountNumber: "100000000001" });
        expect(res.body).not.toHaveProperty("_id");
        expect(res.body).not.toHaveProperty("__v");
    });

    it("returns 404 when the user has no account yet", async () => {
        const res = await request(app)
            .get("/api/accounts/me")
            .set("Authorization", `Bearer ${tokenFor(987654321)}`);

        expect(res.status).toBe(404);
    });

    it.each([
        ["no Authorization header", undefined, "Missing token"],
        ["a header without Bearer", "abc", "Invalid token"],
        ["a token that is not a JWT", "Bearer abc", "Unauthorized: Invalid token"],
        [
            "a token signed with another secret",
            `Bearer ${tokenFor(USER_ID, {}, "other-secret")}`,
            "Unauthorized: Invalid token",
        ],
        ["an expired token", `Bearer ${tokenFor(USER_ID, { expiresIn: -60 })}`, "Unauthorized: Token expired"],
        [
            "a token signed with another algorithm",
            `Bearer ${tokenFor(USER_ID, { algorithm: "HS512" })}`,
            "Unauthorized: Invalid token",
        ],
    ])("rejects %s with 401", async (_case, header, error) => {
        const req = request(app).get("/api/accounts/me");
        const res = await (header ? req.set("Authorization", header) : req);

        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error });
    });
});

describe("GET /api/accounts/sagas/:sagaId", () => {
    it("answers saga-service when it sends the internal key", async () => {
        const res = await request(app).get(`/api/accounts/sagas/${SAGA_ID}`).set("x-internal-key", INTERNAL_KEY);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ debited: false, credited: false, refunded: false });
    });

    it.each([
        ["no internal key", undefined],
        ["a wrong internal key", "wrong-key-wrong-key-wrong-key-wrong"],
        ["a wrong key of the right length", "x".repeat(32)],
    ])("rejects %s with 401", async (_case, key) => {
        const req = request(app).get(`/api/accounts/sagas/${SAGA_ID}`);
        const res = await (key ? req.set("x-internal-key", key) : req);

        expect(res.status).toBe(401);
    });
});

it("returns 404 for an unknown route", async () => {
    const res = await request(app).get("/api/accounts/nothing-here");

    expect(res.status).toBe(404);
});
