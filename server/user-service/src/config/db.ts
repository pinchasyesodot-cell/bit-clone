import { connect } from "mongoose";
import { config } from "./env.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/AppError.js";
import mongoose from "mongoose";

class Database {
    public connect = async (): Promise<void> => {
        try {
            await connect(config.MONGO_URI, {
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });
            logger.info("Connected to MongoDB successfully");
        } catch (error) {
            logger.error("Failed to connect to MongoDB:", { cause: error });
            throw new AppError(`Failed to connect to MongoDB: ${error}`, 500);
        }
    };

    public isConnected = (): boolean => {
        return mongoose.connection.readyState === 1;
    };

    public disconnect = async (): Promise<void> => {
        try {
            await mongoose.disconnect();
            logger.info("MongoDB disconnected successfully.");
        } catch (error) {
            logger.error("Error disconnecting from MongoDB", { cause: error });
        }
    };
}

export default new Database();
