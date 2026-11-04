import type { Server } from "node:http";
import { logger } from "./logger.js";

type ShutdownStep = { name: string; run: () => Promise<void> };

export const closeServer = (server: Server): Promise<void> =>
    new Promise((resolve, reject) => {
        if (!server.listening) {
            resolve();
            return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
    });

export const registerGracefulShutdown = (steps: ShutdownStep[], timeoutMs = 10_000): void => {
    let shuttingDown = false;
    const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
        if (shuttingDown) return;
        shuttingDown = true;
        logger.info(`Received ${signal}. Shutting down gracefully...`);
        const forceExit = setTimeout(() => {
            logger.error("Could not shut down in time, forcing exit");
            process.exit(1);
        }, timeoutMs);
        forceExit.unref();
        try {
            for (const step of steps) {
                await step.run();
                logger.info(`${step.name} closed`);
            }
            clearTimeout(forceExit);
            logger.info("Server shut down gracefully");
            process.exit(exitCode);
        } catch (error) {
            clearTimeout(forceExit);
            logger.error(`Error during shutdown: ${error}`);
            process.exit(1);
        }
    };
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
    process.on("uncaughtException", (err) => {
        logger.error(`Uncaught Exception: ${err.message}`);
        shutdown("uncaughtException", 1);
    });
    process.on("unhandledRejection", (reason) => {
        logger.error(`Unhandled Rejection: ${reason}`);
        shutdown("unhandledRejection", 1);
    });
};
