import { connect } from "mongoose";
import { config } from "./env.js";
import { logger } from "../utils/logger.js";
import { AppError } from "../utils/AppError.js";

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
            throw new AppError("Failed to connect to MongoDB:", 500);
        }
    };
}

export default new Database();
