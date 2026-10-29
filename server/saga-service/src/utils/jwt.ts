import jwt from "jsonwebtoken";
import { AppError } from "./AppError.js";
import { logger } from "./logger.js";
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
