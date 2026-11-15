import jwt from "jsonwebtoken";
import { logger } from "./logger.js";
import { AppError } from "./AppError.js";

export class JWT {
    static verifyToken(token: string, secret: jwt.Secret): jwt.JwtPayload | string {
        try {
            const decoded = jwt.verify(token, secret);
            return decoded;
        } catch (error) {
            logger.error("JWT verification failed:", error);
            throw new AppError("Invalid token", 401);
        }
    }
}
