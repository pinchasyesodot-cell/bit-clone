import { jest } from "@jest/globals";
import type { Request, Response } from "express";
import { wrapAsync } from "../src/utils/wrapAsync.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("wrapAsync", () => {
    it("passes the error to next when the handler fails", async () => {
        const next = jest.fn<(error?: unknown) => void>();
        const error = new Error("boom");

        wrapAsync(() => Promise.reject(error))({} as Request, {} as Response, next);
        await flush();

        expect(next).toHaveBeenCalledWith(error);
    });

    it("passes a real error to next when the handler rejects without one", async () => {
        const next = jest.fn<(error?: unknown) => void>();

        // Rejecting with null is the whole point of this test.
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
        wrapAsync(() => Promise.reject(null))({} as Request, {} as Response, next);
        await flush();

        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
});
