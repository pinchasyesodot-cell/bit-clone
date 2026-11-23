import mongoose, { connect } from "mongoose";
import { config } from "./env.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/AppError.js";
import { errorMessage } from "../utils/errorMessage.js";

class Database {
    public connect = async (): Promise<void> => {
        try {
            await connect(config.MONGO_URI, {
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            logger.info("Connected to MongoDB successfully");
        } catch (error) {
            logger.error("Failed to connect to MongoDB", { cause: errorMessage(error) });
            throw new AppError("Failed to connect to MongoDB", 500, { cause: error });
        }
    };

    public isConnected = (): boolean => {
        return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
    };

    public disconnect = async (): Promise<void> => {
        try {
            await mongoose.disconnect();
            logger.info("Disconnected from MongoDB successfully");
        } catch (error) {
            logger.error("Failed to disconnect from MongoDB", { cause: errorMessage(error) });
            throw new AppError("Failed to disconnect from MongoDB", 500, { cause: error });
        }
    };
}

export default new Database();
