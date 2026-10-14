import express, { type Application } from "express";
import helmet from "helmet";
import cors from "cors";
import { config } from "./config/env.js";
import { logger } from "./utils/logger.js";
import database from "./config/db.js";
import userRouter from "./router/user.router.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { NotFound } from "./utils/AppError.js";
import type { Server as HttpServer } from "http";

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
        this.handleGracefulShutdown();
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
                res.status(200).json({ status: "ok", db: "connected" });
            } else {
                logger.error("Health check failed: Database is disconnected");
                res.status(503).json({ status: "error", db: "disconnected" });
            }
        });
    };

    private initRoutes = (): void => {
        this.app.use("/api/users", userRouter);
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
        } catch (error) {
            logger.error(`Error starting server: ${error}`);
            process.exit(1);
        }
    };

    private handleGracefulShutdown = (): void => {
        const shutdown = async (signal: string) => {
            logger.info(`Received ${signal}. Shutting down gracefully...`);
            this.server.close(async () => {
                logger.info("HTTP server closed.");
                await database.disconnect();
                logger.info("MongoDB disconnected.");
                process.exit(0);
            });
            setTimeout(() => {
                logger.error("Could not close connections in time, forcefully shutting down");
                process.exit(1);
            }, 10000);
        };
        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGINT", () => shutdown("SIGINT"));
        process.on("uncaughtException", (err) => {
            logger.error(`Uncaught Exception: ${err.message}`);
            shutdown("uncaughtException");
        });
        process.on("unhandledRejection", (reason) => {
            logger.error(`Unhandled Rejection: ${reason}`);
            shutdown("unhandledRejection");
        });
    };
}

const server = new Server();

export default server;
