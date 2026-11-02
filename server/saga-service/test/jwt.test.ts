import request from "supertest";
import express, { type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { validateToken } from "../src/validations/token.validation.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";
import { config } from "../src/config/env.js";

const app = express();
app.get("/protected", validateToken, (req: Request, res: Response) => {
    res.status(200).json({ user: req.user });
});
app.use(errorHandler);

const sign = (payload: object, secret: string = config.JWT_SECRET, options: jwt.SignOptions = {}): string =>
    jwt.sign(payload, secret, options);

const callProtected = (authorization?: string) => {
    const req = request(app).get("/protected");
    return authorization === undefined ? req : req.set("Authorization", authorization);
};

describe("validateToken middleware", () => {
    it("lets a valid token through and exposes the userId on req.user", async () => {
        const res = await callProtected(`Bearer ${sign({ userId: 123456789 })}`);
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ user: { userId: 123456789 } });
    });

    it("rejects a request without an Authorization header", async () => {
        const res = await callProtected();
        expect(res.status).toBe(401);
    });

    it("rejects a token without the Bearer prefix", async () => {
        const res = await callProtected(sign({ userId: 123456789 }));
        expect(res.status).toBe(401);
    });

    it("rejects a different scheme (Basic)", async () => {
        const res = await callProtected(`Basic ${sign({ userId: 123456789 })}`);
        expect(res.status).toBe(401);
    });

    it("rejects a token signed with a different secret", async () => {
        const res = await callProtected(`Bearer ${sign({ userId: 123456789 }, "another-secret")}`);
        expect(res.status).toBe(401);
    });

    it("rejects an expired token", async () => {
        const res = await callProtected(`Bearer ${sign({ userId: 123456789 }, config.JWT_SECRET, { expiresIn: -10 })}`);
        expect(res.status).toBe(401);
    });

    it("rejects garbage that is not a JWT", async () => {
        const res = await callProtected("Bearer not-a-real-token");
        expect(res.status).toBe(401);
    });

    it.each([
        ["is missing", {}],
        ["is not a number", { userId: "abc" }],
        ["is not an integer", { userId: 1.5 }],
    ])("rejects a validly signed token whose userId %s", async (_label, payload) => {
        const res = await callProtected(`Bearer ${sign(payload)}`);
        expect(res.status).toBe(401);
    });

    it("never leaks internal details in the error body", async () => {
        const res = await callProtected("Bearer not-a-real-token");
        expect(res.body).toEqual({ error: "Invalid token" });
    });
});
