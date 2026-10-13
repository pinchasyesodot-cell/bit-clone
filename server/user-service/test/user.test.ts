import request from "supertest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import server from "../src/app.js";
import database from "../src/config/db.js";
import { userModel } from "../src/models/User.js";
import { config } from "../src/config/env.js";

const testUser = { userId: 123456789, userName: "testUser", password: "Test1234!" };
const usedIds = [testUser.userId, 100000000, 999999999, 111111111, 987654321];

describe("User API Endpoints", () => {
    beforeAll(async () => {
        await database.connect();
        await userModel.deleteMany({ userId: { $in: usedIds } });
    });

    afterAll(async () => {
        await userModel.deleteMany({ userId: { $in: usedIds } });
        await mongoose.disconnect();
    });

    // ---------------------------------------------------------------

    describe("POST /api/users/", () => {
        it("creates a new user and returns 201 status", async () => {
            const response = await request(server.app).post("/api/users/").send(testUser);
            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty("userId", testUser.userId);
            expect(response.body).not.toHaveProperty("password");
        });

        it("returns 409 status on duplicate userId", async () => {
            const response = await request(server.app).post("/api/users/").send(testUser);
            expect(response.status).toBe(409);
        });

        it("returns 400 status on empty body", async () => {
            const response = await request(server.app).post("/api/users/").send({});
            expect(response.status).toBe(400);
        });

        it.each(["userId", "userName", "password"])("returns 400 when %s is missing", async (missingField) => {
            const body: Record<string, unknown> = { ...testUser, userId: 111111111 };
            delete body[missingField];
            const response = await request(server.app).post("/api/users/").send(body);
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
            const res = await request(server.app)
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
            const res = await request(server.app)
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
            const res = await request(server.app)
                .post("/api/users")
                .send({ ...testUser, userId: 111111111, password: badPassword });
            expect(res.status).toBe(400);
        });

        it("returns 400 on an unknown field", async () => {
            const res = await request(server.app)
                .post("/api/users")
                .send({ ...testUser, userId: 111111111, isAdmin: true });
            expect(res.status).toBe(400);
        });

        it.each([100000000, 999999999])("accepts boundary userId %i", async (id) => {
            const res = await request(server.app)
                .post("/api/users")
                .send({ ...testUser, userId: id, userName: `boundary${id}` });
            expect(res.status).toBe(201);
        });
    });

    // ---------------------------------------------------------------

    describe("POST /api/users/login", () => {
        it("returns 200 and a token in the Authorization header", async () => {
            const res = await request(server.app)
                .post("/api/users/login")
                .send({ userName: testUser.userName, password: testUser.password });

            expect(res.status).toBe(200);
            expect(res.headers.authorization).toMatch(/^Bearer .+/);
            expect(res.body).toHaveProperty("userId", testUser.userId);
            expect(res.body).toHaveProperty("userName", testUser.userName);
        });

        it("returns 401 on wrong password", async () => {
            const res = await request(server.app)
                .post("/api/users/login")
                .send({ userName: testUser.userName, password: "wrong-password" });
            expect(res.status).toBe(401);
        });

        it("fails for a user that does not exist", async () => {
            const res = await request(server.app)
                .post("/api/users/login")
                .send({ userName: "nobody-here", password: "Test1234!" });
            expect([401, 404]).toContain(res.status);
        });

        it("returns 400 on empty body", async () => {
            const res = await request(server.app).post("/api/users/login").send({});
            expect(res.status).toBe(400);
        });

        it.each(["userName", "password"])("returns 400 when %s is missing", async (field) => {
            const body: Record<string, unknown> = {
                userName: testUser.userName,
                password: testUser.password,
            };
            delete body[field];

            const res = await request(server.app).post("/api/users/login").send(body);
            expect(res.status).toBe(400);
        });
    });

    // ---------------------------------------------------------------
    describe("GET /api/users/profile", () => {
        it("returns 200 with the user when the token is valid", async () => {
            const token = jwt.sign({ userId: testUser.userId, userName: testUser.userName }, config.JWT_SECRET, {
                expiresIn: "1h",
            });

            const res = await request(server.app).get("/api/users/profile").set("Authorization", `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty("userId", testUser.userId);
            expect(res.body).not.toHaveProperty("password");
        });

        it("returns 401 without a token", async () => {
            const res = await request(server.app).get("/api/users/profile");
            expect(res.status).toBe(401);
        });

        it("returns 401 with an invalid token", async () => {
            const res = await request(server.app)
                .get("/api/users/profile")
                .set("Authorization", "Bearer not-a-real-token");
            expect(res.status).toBe(401);
        });

        it("returns 401 with an expired token", async () => {
            const token = jwt.sign({ userId: testUser.userId, userName: testUser.userName }, config.JWT_SECRET, {
                expiresIn: -10,
            });

            const res = await request(server.app).get("/api/users/profile").set("Authorization", `Bearer ${token}`);
            expect(res.status).toBe(401);
        });

        it("returns 401 with a token signed by a wrong secret", async () => {
            const token = jwt.sign({ userId: testUser.userId, userName: testUser.userName }, "wrong-secret", {
                expiresIn: "1h",
            });

            const res = await request(server.app).get("/api/users/profile").set("Authorization", `Bearer ${token}`);
            expect(res.status).toBe(401);
        });

        it("returns 404 when the user does not exist", async () => {
            const token = jwt.sign({ userId: 999999998, userName: "ghost" }, config.JWT_SECRET, { expiresIn: "1h" });

            const res = await request(server.app).get("/api/users/profile").set("Authorization", `Bearer ${token}`);
            expect(res.status).toBe(404);
        });
    });
});
