import type { ExtendedError, Socket } from "socket.io";
import { config } from "../config/env.js";
import { JWT } from "../utils/jwt.js";
import { logger } from "../utils/logger.js";

// Runs before a socket connection is accepted: next(error) rejects it, next() lets it in.
// The user comes from the signed token, never from anything the client claims.
export const socketAuth = (socket: Socket, next: (err?: ExtendedError) => void): void => {
    try {
        const token = socket.handshake.auth.token as string | undefined;
        if (!token) return next(new Error("Unauthorized"));

        const payload = JWT.verifyToken(token, config.JWT_SECRET);
        const userId = typeof payload === "string" ? NaN : Number(payload.userId);
        if (!Number.isInteger(userId)) return next(new Error("Unauthorized"));

        socket.data.userId = String(userId);
        next();
    } catch (error) {
        logger.warn(`Socket auth failed: ${error}`);
        next(new Error("Unauthorized"));
    }
};
