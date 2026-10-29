import { Server } from "socket.io";
import type http from "node:http";
import { logger } from "../utils/logger.js";
import { config } from "../config/env.js";
import { socketAuth } from "../middlewares/socketAuth.js";

class SocketService {
    private io: Server | null = null;

    public initSocket = (httpServer: http.Server): void => {
        this.io = new Server(httpServer, {
            cors: {
                origin: config.URL_CLIENT,
                methods: ["GET", "POST"],
            },
        });

        this.io.use(socketAuth);

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
