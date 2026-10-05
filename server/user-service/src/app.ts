import express, { type Application } from "express";
import { config } from "./config/env.js";
import { logger } from "./utils/logger.js";
import database from "./config/db.js";
import userRouter from "./router/user.router.js";

const port = config.PORT;

class Server {
  public app: Application;
  constructor() {
    this.app = express();
    this.initMiddlewares();
    this.start();
  }
  private initMiddlewares = (): void => {
    this.app.use(express.json());
    this.app.use(
      (
        req: express.Request,
        _res: express.Response,
        next: express.NextFunction,
      ) => {
        logger.info(
          `Incoming request: method: ${req.method}, url: ${req.url}, IP: ${req.ip}`,
        );
        next();
      });
    this.app.use("/api/users", userRouter);
  };
  public start = async (): Promise<void> => {
    try {
      await database.connect();
      this.app.listen(port, () => {
        logger.info(`Server is running on port ${port}`);
      });
    } catch (error) {
      logger.error(`Error starting server: ${error}`);
      process.exit(1);
    }
  };
}

const server = new Server();
