import jwt from "jsonwebtoken";
import { AppError } from "./AppError.js";
import { logger } from "./logger.js";

export class JWT {
    static getUserId = (token: string, secret: jwt.Secret): number | null => {
        const payload = JWT.verifyToken(token, secret);
        const userId = typeof payload === "string" ? NaN : Number(payload.userId);
        return Number.isInteger(userId) ? userId : null;
    };

    static verifyToken = (token: string, secret: jwt.Secret): jwt.JwtPayload | string => {
        try {
            const decoded = jwt.verify(token, secret);
            return decoded;
        } catch (error) {
            logger.error("JWT verification failed:", error);
            throw new AppError("Invalid token", 401);
        }
    };
}
