import { connect } from "mongoose";
import { config } from "./env.js";
import { logger } from "../utils/logger.js";

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
            throw new Error("Failed to connect to MongoDB:");
        }
    };
}

export default new Database();
