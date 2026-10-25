import { Server } from "socket.io";
import type http from "node:http";
import { logger } from "../utils/logger.js";
import { config } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { JWT } from "../utils/jwt.js";

class SocketService {
    private io: Server | null = null;

    public initSocket = (httpServer: http.Server): void => {
        this.io = new Server(httpServer, {
            cors: {
                origin: config.URL_CLIENT,
                methods: ["GET", "POST"],
            },
        });

        this.io.use((socket, next) => {
            try {
                const token = socket.handshake.auth.token as string | undefined;
                if (!token) return next(new AppError("Unauthorized", 409));
                const payload = JWT.verifyToken(token, config.JWT_SECRET);
                if (typeof payload === "string") return next(new AppError("Unauthorized", 409));
                socket.data.userId = String(payload.userId);
                next();
            } catch (error) {
                logger.error(`Unauthorized ${error}`);
                next(new AppError("Unauthorized", 409));
            }
        });
        this.io.on("connection", (socket) => {
            const userId = socket.data.userId as string;
            void socket.join(userId);
            logger.info(`Client connected: ${socket.id} (user ${userId})`);
        });
    };

    public emitToUser = <T>(userId: string, event: string, data: T): void => {
        if (this.io) {
            this.io.to(userId).emit(event, data);
        }
    };
}

export default new SocketService();
