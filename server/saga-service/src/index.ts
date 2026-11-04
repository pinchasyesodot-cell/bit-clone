import server from "./server.js";
import database from "./config/db.js";
import { config } from "./config/env.js";
import { rabbitMQConfig } from "./config/rabbitmq.js";
import { SagaService } from "./service/saga.service.js";
import socketIo from "./service/socket.service.js";
import { closeServer, registerGracefulShutdown } from "./utils/gracefulShutdown.js";
import { logger } from "./utils/logger.js";

try {
    await database.connect();
    const app = server.listen(config.PORT, () => {
        logger.info(`Server is running on port ${config.PORT}`);
    });
    socketIo.initSocket(app);
    await SagaService.consumeSagaMessages();
    const timeoutCheck = setInterval(() => void SagaService.handleTimeouts(), 3000);
    timeoutCheck.unref();

    registerGracefulShutdown([
        { name: "Timeout check", run: async () => clearInterval(timeoutCheck) },
        { name: "WebSocket clients", run: () => socketIo.close() },
        { name: "HTTP server", run: () => closeServer(app) },
        { name: "RabbitMQ", run: () => rabbitMQConfig.close() },
        { name: "Database", run: () => database.disconnect() },
    ]);
} catch (error) {
    logger.error(`Error starting server: ${error}`);
    process.exit(1);
}
