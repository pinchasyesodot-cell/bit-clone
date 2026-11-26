import express, { type Application } from "express";
import helmet from "helmet";
import cors from "cors";
import { config } from "./config/env.js";
import { logger } from "./utils/logger.js";
import database from "./config/db.js";
import userRouter from "./router/user.router.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { NotFound } from "./utils/AppError.js";

class Server {
    public app: Application;
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
            if (req.path !== "/health") {
                logger.info(`Incoming request: method: ${req.method}, url: ${req.url}, IP: ${req.ip}`);
            }
            next();
        });
    };

    private initHealthCheck = (): void => {
        this.app.get("/health", (_req, res) => {
            if (database.isConnected()) {
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
}

export default new Server().app;
