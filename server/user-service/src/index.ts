import server from "./server.js";
import database from "./config/db.js";
import { config } from "./config/env.js";
import { closeServer, registerGracefulShutdown } from "./utils/gracefulShutdown.js";
import { logger } from "./utils/logger.js";
import { errorMessage } from "./utils/errorMessage.js";
import { rabbitMQConfig } from "./config/rabbitmq.js";

try {
    await database.connect();
    await rabbitMQConfig.connect();
    const app = server.listen(config.PORT, () => {
        logger.info(`Server is running on port ${config.PORT}`);
    });
    registerGracefulShutdown([
        { name: "HTTP server", run: () => closeServer(app) },
        { name: "RabbitMQ", run: () => rabbitMQConfig.close() },
        { name: "Database", run: () => database.disconnect() },
    ]);
} catch (error) {
    logger.error("Error starting server", { error: errorMessage(error) });
    process.exit(1);
}
