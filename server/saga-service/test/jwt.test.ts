import request from "supertest";
import express, { type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { validateToken } from "../src/middlewares/validateToken.js";
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

    it.each([
        ["no Authorization header", undefined, "Missing token"],
        ["a token without the Bearer prefix", sign({ userId: 123456789 }), "Invalid token"],
        ["a different scheme (Basic)", `Basic ${sign({ userId: 123456789 })}`, "Invalid token"],
        ["garbage that is not a JWT", "Bearer not-a-real-token", "Unauthorized: Invalid token"],
        [
            "a token signed with a different secret",
            `Bearer ${sign({ userId: 123456789 }, "another-secret")}`,
            "Unauthorized: Invalid token",
        ],
        [
            "a token signed with another algorithm",
            `Bearer ${sign({ userId: 123456789 }, config.JWT_SECRET, { algorithm: "HS512" })}`,
            "Unauthorized: Invalid token",
        ],
        [
            "an expired token",
            `Bearer ${sign({ userId: 123456789 }, config.JWT_SECRET, { expiresIn: -10 })}`,
            "Unauthorized: Token expired",
        ],
    ])("rejects %s with 401 and says why, without internal details", async (_label, authorization, error) => {
        const res = await callProtected(authorization);
        expect(res.status).toBe(401);
        expect(res.body).toEqual({ error });
    });

    it.each([
        ["is missing", {}],
        ["is not a number", { userId: "abc" }],
        ["is not an integer", { userId: 1.5 }],
    ])("rejects a validly signed token whose userId %s", async (_label, payload) => {
        const res = await callProtected(`Bearer ${sign(payload)}`);
        expect(res.status).toBe(401);
    });
});
