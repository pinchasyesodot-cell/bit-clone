import type { Request, Response, NextFunction } from "express";
import { JWT } from "../utils/jwt.js";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/AppError.js";

export const validateToken = (req: Request, _res: Response, next: NextFunction) => {
    const [scheme, token] = req.get("Authorization")?.split(" ") ?? [];
    if (scheme !== "Bearer" || !token) {
        logger.warn("Access denied. Invalid token format.");
        return next(new AppError("Invalid token", 401));
    }
    try {
        const payload = JWT.verifyToken(token, config.JWT_SECRET);
        const userId = typeof payload === "string" ? NaN : Number(payload.userId);
        if (!Number.isInteger(userId)) {
            logger.warn("Invalid token payload: userId is not a valid integer.");
            return next(new AppError("Invalid token", 401));
        }
        req.user = { userId };
        return next();
    } catch (error) {
        return next(error);
    }
};
