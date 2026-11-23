import { rateLimit } from "express-rate-limit";
import { config } from "../config/env.js";
import { AppError } from "../utils/AppError.js";

export const transferRateLimit = rateLimit({
    windowMs: 60_000,
    limit: config.TRANSFER_RATE_LIMIT,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // Runs after validateToken, so the limit is per user, not per IP.
    keyGenerator: (req) => String(req.user?.userId),
    handler: (_req, _res, next) => next(new AppError("Too many transfers, try again in a minute", 429)),
});
