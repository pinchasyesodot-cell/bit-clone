import type { ExtendedError } from "socket.io";
import { config } from "../config/env.js";
import { JWT } from "../utils/jwt.js";
import { logger } from "../utils/logger.js";
import { errorMessage } from "../utils/errorMessage.js";
import type { AppSocket } from "../types/socket.js";

// Runs before a socket connection is accepted: next(error) rejects it, next() lets it in.
// The user comes from the signed token, never from anything the client claims.
export const socketAuth = (socket: AppSocket, next: (err?: ExtendedError) => void): void => {
    try {
        const token = socket.handshake.auth.token as string | undefined;
        if (!token) return next(new Error("Unauthorized"));

        const userId = JWT.getUserId(token, config.JWT_SECRET);
        if (userId === null) return next(new Error("Unauthorized"));

        socket.data.userId = String(userId);
        next();
    } catch (error) {
        logger.warn("Socket auth failed", { error: errorMessage(error) });
        next(new Error("Unauthorized"));
    }
};
