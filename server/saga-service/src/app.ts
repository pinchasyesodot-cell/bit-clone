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
import { NotFound } from "./utils/AppError.js";

const port = config.PORT;

class Server {
    public app: Application;
    private server!: HttpServer;

    constructor() {
        this.app = express();
        this.initMiddlewares();
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

        this.app.use("/api/saga", sagaRouter);
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
        } catch (error) {
            logger.error(`Error starting server: ${error}`);
            process.exit(1);
        }
    };
}

const server = new Server();
export default server;
