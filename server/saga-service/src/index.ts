import server from "./server.js";
import database from "./config/db.js";
import { config } from "./config/env.js";
import { rabbitMQConfig } from "./config/rabbitmq.js";
import { SagaManager } from "./managers/saga.manager.js";
import socketIo from "./service/socket.service.js";
import { closeServer, registerGracefulShutdown } from "./utils/gracefulShutdown.js";
import { logger } from "./utils/logger.js";
import { errorMessage } from "./utils/errorMessage.js";

try {
    await database.connect();
    const app = server.listen(config.PORT, () => {
        logger.info(`Server is running on port ${config.PORT}`);
    });
    socketIo.initSocket(app);
    await SagaManager.consumeSagaMessages();
    const timeoutCheck = setInterval(() => void SagaManager.handleTimeouts(), 3000);
    timeoutCheck.unref();

    registerGracefulShutdown([
        { name: "Timeout check", run: () => Promise.resolve(clearInterval(timeoutCheck)) },
        { name: "WebSocket clients", run: () => socketIo.close() },
        { name: "HTTP server", run: () => closeServer(app) },
        { name: "RabbitMQ", run: () => rabbitMQConfig.close() },
        { name: "Database", run: () => database.disconnect() },
    ]);
} catch (error) {
    logger.error("Error starting server", { error: errorMessage(error) });
    process.exit(1);
}
