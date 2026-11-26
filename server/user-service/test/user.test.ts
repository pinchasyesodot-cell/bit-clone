import { jest } from "@jest/globals";
import request from "supertest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { UserCreatedEvent } from "../src/interfaces/userType.js";

// The broker is replaced: these tests check what user-service sends, not RabbitMQ itself.
const mockPublish = jest.fn<(queue: string, message: UserCreatedEvent) => Promise<void>>();
jest.unstable_mockModule("../src/config/rabbitmq.js", () => ({
    rabbitMQConfig: { publishMessage: mockPublish },
}));

const { default: server } = await import("../src/server.js");
const { userModel } = await import("../src/models/User.js");
const { config } = await import("../src/config/env.js");

// The first run downloads the MongoDB binary, which can take a while.
jest.setTimeout(120_000);

const testUser = { userId: 123456789, userName: "testUser", password: "Test1234!" };

let mongod: MongoMemoryServer;

describe("User API Endpoints", () => {
    beforeEach(() => {
        mockPublish.mockReset();
        mockPublish.mockResolvedValue(undefined);
    });

    // Every run gets its own empty MongoDB on a free port, deleted when the run ends.
    beforeAll(async () => {
        mongod = await MongoMemoryServer.create();
        await mongoose.connect(mongod.getUri());
    });

    afterAll(async () => {
        await mongoose.disconnect();
        await mongod.stop();
    });

    // ---------------------------------------------------------------

    describe("POST /api/users/", () => {
        it("creates a new user and returns 201 status", async () => {
            const response = await request(server).post("/api/users/").send(testUser);
            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty("userId", testUser.userId);
            expect(response.body).not.toHaveProperty("password");
        });

        it("returns 409 status on duplicate userId", async () => {
            const response = await request(server).post("/api/users/").send(testUser);
            expect(response.status).toBe(409);
        });

        it("announces the new user to account-service with the ID as a 9-digit string", async () => {
            const res = await request(server)
                .post("/api/users")
                .send({ userId: 100000000, userName: "announced", password: "Test1234!" });

            expect(res.status).toBe(201);
            expect(mockPublish).toHaveBeenCalledTimes(1);
            expect(mockPublish).toHaveBeenCalledWith("user_created_queue", {
                type: "USER_CREATED",
                payload: { userId: "100000000" },
            });
            await userModel.deleteOne({ userId: 100000000 });
        });

        it("removes the user and fails when the broker does not confirm the event, so the signup can be retried", async () => {
            const newcomer = { userId: 999999999, userName: "unlucky", password: "Test1234!" };
            mockPublish.mockRejectedValueOnce(new Error("broker down"));

            const failed = await request(server).post("/api/users").send(newcomer);

            expect(failed.status).toBe(500);
            expect(failed.body).toEqual({ error: "Internal Server Error" });
            expect(await userModel.exists({ userId: newcomer.userId })).toBeNull();

            const retried = await request(server).post("/api/users").send(newcomer);
            expect(retried.status).toBe(201);
            await userModel.deleteOne({ userId: newcomer.userId });
        });

        it("does not announce a user that was not created", async () => {
            const res = await request(server).post("/api/users/").send(testUser);
            expect(res.status).toBe(409);
            expect(mockPublish).not.toHaveBeenCalled();
        });

        it("returns 400 status on empty body", async () => {
            const response = await request(server).post("/api/users/").send({});
            expect(response.status).toBe(400);
        });

        it.each(["userId", "userName", "password"])("returns 400 when %s is missing", async (missingField) => {
            const body: Record<string, unknown> = { ...testUser, userId: 111111111 };
            delete body[missingField];
            const response = await request(server).post("/api/users/").send(body);
            expect(response.status).toBe(400);
        });

        it.each([
            ["too short (3 digits)", 123],
            ["too short (8 digits)", 12345678],
            ["too long (10 digits)", 1234567890],
            ["not an integer", 123456789.5],
            ["a string", "abcdefghi"],
            ["negative", -123456789],
            ["an empty string", ""],
            ["only spaces", "   "],
            ["a null", null],
            ["a object", { a: 1 }],
            ["an array", [1, 2, 3]],
            ["an aboolean", true],
        ])("returns 400 when userId is %s", async (_label, badUserId) => {
            const res = await request(server)
                .post("/api/users")
                .send({ ...testUser, userId: badUserId });

            expect(res.status).toBe(400);
        });

        it.each([
            ["an empty string", ""],
            ["only spaces", "   "],
            ["a number", 12345],
            ["a null", null],
            ["a object", { a: 1 }],
            ["an array", [1, 2, 3]],
            ["an aboolean", true],
        ])("returns 400 when userName is %s", async (_label, badName) => {
            const res = await request(server)
                .post("/api/users")
                .send({ ...testUser, userId: 111111111, userName: badName });
            expect(res.status).toBe(400);
        });

        it.each([
            ["an empty string", ""],
            ["only spaces", "      "],
            ["too short (5 chars)", "12345"],
            ["a number", 123456],
            ["null", null],
            ["a object", { a: 1 }],
            ["an array", [1, 2, 3]],
            ["an aboolean", true],
        ])("returns 400 when password is %s", async (_label, badPassword) => {
            const res = await request(server)
                .post("/api/users")
                .send({ ...testUser, userId: 111111111, password: badPassword });
            expect(res.status).toBe(400);
        });

        it("returns 400 on an unknown field", async () => {
            const res = await request(server)
                .post("/api/users")
                .send({ ...testUser, userId: 111111111, isAdmin: true });
            expect(res.status).toBe(400);
        });

        it.each([100000000, 999999999])("accepts boundary userId %i", async (id) => {
            const res = await request(server)
                .post("/api/users")
                .send({ ...testUser, userId: id, userName: `boundary${id}` });
            expect(res.status).toBe(201);
        });
    });

    // ---------------------------------------------------------------

    describe("POST /api/users/login", () => {
        it("returns 200 and a token in the Authorization header", async () => {
            const res = await request(server)
                .post("/api/users/login")
                .send({ userId: testUser.userId, password: testUser.password });

            expect(res.status).toBe(200);
            expect(res.headers.authorization).toMatch(/^Bearer .+/);
            const token = res.get("Authorization")?.split(" ")[1] ?? "";
            expect(jwt.decode(token, { complete: true })?.header.alg).toBe("HS256");
            expect(res.body).toHaveProperty("userId", testUser.userId);
            expect(res.body).toHaveProperty("userName", testUser.userName);
        });

        it("returns 401 on wrong password", async () => {
            const res = await request(server)
                .post("/api/users/login")
                .send({ userId: testUser.userId, password: "wrong-password" });
            expect(res.status).toBe(401);
        });

        it("lets two users with the same name each log in with their own ID", async () => {
            const namesake = { ...testUser, userId: 987654321, password: "Other5678!" };
            expect((await request(server).post("/api/users").send(namesake)).status).toBe(201);

            const first = await request(server)
                .post("/api/users/login")
                .send({ userId: testUser.userId, password: testUser.password });
            const second = await request(server)
                .post("/api/users/login")
                .send({ userId: namesake.userId, password: namesake.password });

            expect(first.status).toBe(200);
            expect(first.body).toEqual({ userId: testUser.userId, userName: testUser.userName });
            expect(second.status).toBe(200);
            expect(second.body).toEqual({ userId: namesake.userId, userName: testUser.userName });
        });

        it("keeps the spaces in a password exactly as typed", async () => {
            const spaced = { userId: 111111111, userName: "spaced", password: "  pass word  " };
            expect((await request(server).post("/api/users").send(spaced)).status).toBe(201);

            const exact = await request(server)
                .post("/api/users/login")
                .send({ userId: spaced.userId, password: spaced.password });
            const trimmed = await request(server)
                .post("/api/users/login")
                .send({ userId: spaced.userId, password: "pass word" });

            expect(exact.status).toBe(200);
            expect(trimmed.status).toBe(401);
        });

        it("fails for a user that does not exist", async () => {
            const res = await request(server)
                .post("/api/users/login")
                .send({ userId: 999999998, password: "Test1234!" });
            expect([401, 404]).toContain(res.status);
        });

        it("returns 400 on empty body", async () => {
            const res = await request(server).post("/api/users/login").send({});
            expect(res.status).toBe(400);
        });

        it.each(["userId", "password"])("returns 400 when %s is missing", async (field) => {
            const body: Record<string, unknown> = {
                userId: testUser.userId,
                password: testUser.password,
            };
            delete body[field];

            const res = await request(server).post("/api/users/login").send(body);
            expect(res.status).toBe(400);
        });
    });

    // ---------------------------------------------------------------
    describe("GET /api/users/profile", () => {
        it("returns 200 with the user when the token is valid", async () => {
            const token = jwt.sign({ userId: testUser.userId, userName: testUser.userName }, config.JWT_SECRET, {
                expiresIn: "1h",
            });

            const res = await request(server).get("/api/users/profile").set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("userId", testUser.userId);
            expect(res.body).not.toHaveProperty("password");
        });

        it("returns 401 without a token", async () => {
            const res = await request(server).get("/api/users/profile");
            expect(res.status).toBe(401);
        });

        it("returns 401 with an invalid token", async () => {
            const res = await request(server).get("/api/users/profile").set("Authorization", "Bearer not-a-real-token");
            expect(res.status).toBe(401);
        });

        it("returns 401 with an expired token", async () => {
            const token = jwt.sign({ userId: testUser.userId, userName: testUser.userName }, config.JWT_SECRET, {
                expiresIn: -10,
            });

            const res = await request(server).get("/api/users/profile").set("Authorization", `Bearer ${token}`);
            expect(res.status).toBe(401);
        });

        it("returns 401 with a token signed by a wrong secret", async () => {
            const token = jwt.sign({ userId: testUser.userId, userName: testUser.userName }, "wrong-secret", {
                expiresIn: "1h",
            });

            const res = await request(server).get("/api/users/profile").set("Authorization", `Bearer ${token}`);
            expect(res.status).toBe(401);
        });

        it("returns 404 when the user does not exist", async () => {
            const token = jwt.sign({ userId: 999999998, userName: "ghost" }, config.JWT_SECRET, { expiresIn: "1h" });

            const res = await request(server).get("/api/users/profile").set("Authorization", `Bearer ${token}`);
            expect(res.status).toBe(404);
        });

        it("returns 404 on an unknown route", async () => {
            const res = await request(server).get("/api/users/does-not-exist");
            expect(res.status).toBe(404);
            expect(res.body).toHaveProperty("error", "Route not found");
        });
    });
});
