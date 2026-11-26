import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

const expected = Buffer.from(config.INTERNAL_API_KEY);

export const requireInternalKey = (req: Request, _res: Response, next: NextFunction): void => {
    const provided = Buffer.from(req.get("x-internal-key") ?? "");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
        throw new AppError("Unauthorized", 401);
    }
    next();
};
