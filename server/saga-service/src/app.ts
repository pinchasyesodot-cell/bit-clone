import express, { type Application } from "express";
import helmet from "helmet";
import cors from "cors";
import { config } from "./config/env.js";
import { logger } from "./utils/logger.js";
import database from "./config/db.js";
import sagaRouter from "./router/saga.router.js";
import { SagaService } from "./service/saga.service.js";
import socketIo from "./service/socket.service.js";
import type { Server as HttpServer } from "node:http";
import { errorHandler } from "./middlewares/errorHandler.js";
import { AppError, NotFound } from "./utils/AppError.js";

const port = config.PORT;

class Server {
    public app: Application;
    private server!: HttpServer;

    constructor() {
        this.app = express();
        this.initMiddlewares();
        this.initHealthCheck();
        this.initRoutes();
        this.initErrorHandling();
    }

    private initMiddlewares = (): void => {
        this.app.set("trust proxy", 1);
        this.app.use(helmet());
        this.app.use(
            cors({
                origin: config.URL_CLIENT,
                exposedHeaders: ["Authorization"],
            })
        );
        this.app.use(express.json({ limit: "10kb" }));
        this.app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
            logger.info(`Incoming request: method: ${req.method}, url: ${req.url}, IP: ${req.ip}`);
            next();
        });
    };
    private initHealthCheck = (): void => {
        this.app.get("/health", (_req, res) => {
            const isDbConnected = database.isConnected();
            if (isDbConnected) {
                res.status(200).json({ status: "OK", db: "Connected" });
            } else {
                logger.error("Health check failed: Database is not connected");
                new AppError("Database is not connected", 503);
            }
        });
    };

    private initRoutes = (): void => {
        this.app.use("/api/saga", sagaRouter);
    };

    private initErrorHandling = (): void => {
        this.app.use((_req, _res, next) => next(new NotFound("Route not found")));
        this.app.use(errorHandler);
    };

    public start = async (): Promise<void> => {
        try {
            await database.connect();
            this.server = this.app.listen(port, () => {
                logger.info(`Server is running on port ${port}`);
            });
            socketIo.initSocket(this.server);
            await SagaService.consumeSagaMessages();
            setInterval(() => void SagaService.handleTimeouts(), 3000).unref();
            this.handleGracefulShutdown();
        } catch (error) {
            logger.error(`Error starting server: ${error}`);
            process.exit(1);
        }
    };

    private isShuttingDown = false;
    private handleGracefulShutdown = (): void => {
        const shutdown = async (signal: string, exitCode = 0) => {
            if (this.isShuttingDown) return;
            this.isShuttingDown = true;
            logger.info(`Received ${signal}. Shutting down gracefully...`);
            this.server.close(async (err) => {
                if (err) {
                    logger.error(`Error closing server: ${err}`);
                    process.exit(1);
                }
                try {
                    await database.disconnect();
                    logger.info("Server shut down gracefully");
                    process.exit(exitCode);
                } catch (dbError) {
                    logger.error(`Error during shutdown: ${dbError}`);
                    process.exit(1);
                }
            });
            setTimeout(() => {
                logger.error("Could not close connections in time, forcefully shutting down");
                process.exit(1);
            }, 10000).unref();
        };
        process.on("SIGINT", () => void shutdown("SIGINT"));
        process.on("SIGTERM", () => void shutdown("SIGTERM"));
        process.on("uncaughtException", (err) => {
            logger.error(`Uncaught Exception: ${err.message}`);
            shutdown("uncaughtException", 1);
        });
        process.on("unhandledRejection", (reason) => {
            logger.error(`Unhandled Rejection: ${reason}`);
            shutdown("unhandledRejection", 1);
        });
    };
}

const server = new Server();
export default server;
