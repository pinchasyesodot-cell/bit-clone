import request from "supertest";
import jwt from "jsonwebtoken";
import server from "../src/app.js";
import { config } from "../src/config/env.js";

const validUser = { userId: 123456789, userName: "dana", password: "Test1234!" };

const sign = (payload: object, secret: string = config.JWT_SECRET, options: jwt.SignOptions = {}): string =>
    jwt.sign(payload, secret, options);

const getProfile = (authorization?: string) => {
    const req = request(server.app).get("/api/users/profile");
    return authorization === undefined ? req : req.set("Authorization", authorization);
};

describe("validation messages reach the client", () => {
    it.each([
        ["a userId that is too short", { ...validUser, userId: 5 }, /9 digits/],
        ["a password longer than 72 characters", { ...validUser, password: "a".repeat(73) }, /at most 72/],
        ["a password shorter than 6 characters", { ...validUser, password: "12345" }, /at least 6/],
        ["an unknown field", { ...validUser, isAdmin: true }, /isAdmin/],
        ["a missing userName", { userId: validUser.userId, password: validUser.password }, /userName/],
    ])("POST /api/users with %s answers 400 with the reason", async (_label, body, reason) => {
        const res = await request(server.app).post("/api/users").send(body);
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(reason);
    });

    it("POST /api/users/login with an empty body answers 400 with the reason", async () => {
        const res = await request(server.app).post("/api/users/login").send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/userName/);
    });
});

describe("GET /api/users/profile rejects bad credentials before touching the database", () => {
    it.each([
        ["no Authorization header", undefined],
        ["a token without the Bearer prefix", sign({ userId: validUser.userId })],
        ["a different scheme (Basic)", `Basic ${sign({ userId: validUser.userId })}`],
        ["garbage instead of a token", "Bearer not-a-real-token"],
        ["a token signed with another secret", `Bearer ${sign({ userId: validUser.userId }, "another-secret")}`],
        ["an expired token", `Bearer ${sign({ userId: validUser.userId }, config.JWT_SECRET, { expiresIn: -10 })}`],
        ["a valid token without a userId", `Bearer ${sign({ userName: "dana" })}`],
        ["a valid token whose userId is not a number", `Bearer ${sign({ userId: "abc" })}`],
        ["a valid token whose userId is not an integer", `Bearer ${sign({ userId: 1.5 })}`],
    ])("answers 401 for %s", async (_label, authorization) => {
        const res = await getProfile(authorization);
        expect(res.status).toBe(401);
        expect(res.body).toHaveProperty("error");
        expect(res.body).not.toHaveProperty("message");
    });
});
