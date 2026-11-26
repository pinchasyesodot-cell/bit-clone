import mongoose, { connect } from "mongoose";
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
            throw new Error("Failed to connect to MongoDB", { cause: error });
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
            throw new Error("Failed to disconnect from MongoDB", { cause: error });
        }
    };
}

export default new Database();
